"use server";

/**
 * Ajustes: lender identity (owners, through RLS: only name and brand_color are writable) and the team (owners,
 * checked here, written with the service role since lender_members is read-only for clients). Every change is
 * audit-logged. The last owner can never be demoted or removed.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appBaseUrl } from "@/lib/app-url";
import { requireLender, type LenderContext } from "@/lib/lender";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateUser, ROLES, type Role } from "@/lib/team";

export type Result = { ok: true; message?: string } | { ok: false; message: string };

const ONLY_OWNERS = "Solo las personas administradoras pueden cambiar los ajustes.";

async function owner(): Promise<LenderContext | null> {
  const lender = await requireLender();
  return lender.role === "owner" ? lender : null;
}

async function audit(lender: LenderContext, action: string, detail: Record<string, unknown>) {
  await (await createClient()).from("audit_log").insert({ lender_id: lender.lenderId, case_id: null, actor: lender.userId, action, detail });
}

const LenderInput = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la entidad.").max(120),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Elige un color válido."),
});

export async function updateLender(input: z.input<typeof LenderInput>): Promise<Result> {
  const lender = await owner();
  if (!lender) return { ok: false, message: ONLY_OWNERS };
  const p = LenderInput.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Datos no válidos." };
  const db = await createClient();
  const { data, error } = await db.from("lenders").update({ name: p.data.name, brand_color: p.data.brandColor.toUpperCase() }).eq("id", lender.lenderId).select("id");
  if (error || !data?.length) return { ok: false, message: "No hemos podido guardar los cambios." };
  await audit(lender, "lender.updated", { name: p.data.name, brand_color: p.data.brandColor });
  revalidatePath("/", "layout");
  return { ok: true, message: "Guardado." };
}

const InviteInput = z.object({ email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254), role: z.enum(ROLES as [Role, ...Role[]]) });

export async function inviteMember(input: z.input<typeof InviteInput>): Promise<Result> {
  const lender = await owner();
  if (!lender) return { ok: false, message: ONLY_OWNERS };
  const p = InviteInput.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Datos no válidos." };
  const { email, role } = p.data;

  const user = await findOrCreateUser(email);
  if ("error" in user) return { ok: false, message: user.error };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("lender_members").select("lender_id").eq("user_id", user.userId);
  if (existing?.some((m) => m.lender_id === lender.lenderId)) return { ok: false, message: `${email} ya forma parte del equipo.` };
  if (existing?.length) return { ok: false, message: `${email} ya pertenece a otra entidad en credIA. Usa otro correo.` };

  const { error } = await admin.from("lender_members").insert({ lender_id: lender.lenderId, user_id: user.userId, role });
  if (error) return { ok: false, message: "No hemos podido añadirlo al equipo." };
  await audit(lender, "member.invited", { user_id: user.userId, role });

  const { sent } = await getNotifier().sendTeamInvite({ to: email, lenderName: lender.lenderName, invitedBy: lender.email, role, loginUrl: `${await appBaseUrl()}/login` });
  revalidatePath("/ajustes");
  return {
    ok: true,
    message: sent
      ? `Invitación enviada a ${email}.`
      : isEmailConfigured()
        ? `${email} ya tiene acceso, pero no se ha podido enviar el correo: avísale tú de que entre en credIA con ese correo.`
        : `${email} ya tiene acceso. No hay correo configurado: avísale tú de que entre en credIA con ese correo.`,
  };
}

const MemberInput = z.object({ userId: z.string().uuid() });

async function ownerCount(lenderId: string): Promise<number> {
  const { count } = await createAdminClient().from("lender_members").select("user_id", { count: "exact", head: true }).eq("lender_id", lenderId).eq("role", "owner");
  return count ?? 0;
}

async function memberRole(lenderId: string, userId: string): Promise<Role | null> {
  const { data } = await createAdminClient().from("lender_members").select("role").eq("lender_id", lenderId).eq("user_id", userId).maybeSingle();
  return (data?.role as Role | undefined) ?? null;
}

export async function changeRole(input: { userId: string; role: Role }): Promise<Result> {
  const lender = await owner();
  if (!lender) return { ok: false, message: ONLY_OWNERS };
  const p = MemberInput.extend({ role: z.enum(ROLES as [Role, ...Role[]]) }).safeParse(input);
  if (!p.success) return { ok: false, message: "Datos no válidos." };
  const current = await memberRole(lender.lenderId, p.data.userId);
  if (!current) return { ok: false, message: "Esa persona ya no está en el equipo." };
  if (current === "owner" && p.data.role !== "owner" && (await ownerCount(lender.lenderId)) <= 1) {
    return { ok: false, message: "Tiene que quedar al menos una persona administradora." };
  }
  const { error } = await createAdminClient().from("lender_members").update({ role: p.data.role }).eq("lender_id", lender.lenderId).eq("user_id", p.data.userId);
  if (error) return { ok: false, message: "No hemos podido cambiar el rol." };
  await audit(lender, "member.role_changed", { user_id: p.data.userId, from: current, to: p.data.role });
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function removeMember(input: { userId: string }): Promise<Result> {
  const lender = await owner();
  if (!lender) return { ok: false, message: ONLY_OWNERS };
  const p = MemberInput.safeParse(input);
  if (!p.success) return { ok: false, message: "Datos no válidos." };
  if (p.data.userId === lender.userId) return { ok: false, message: "No puedes quitarte a ti. Pide a otra persona administradora que lo haga." };
  const current = await memberRole(lender.lenderId, p.data.userId);
  if (!current) return { ok: true };
  if (current === "owner" && (await ownerCount(lender.lenderId)) <= 1) return { ok: false, message: "Tiene que quedar al menos una persona administradora." };
  const { error } = await createAdminClient().from("lender_members").delete().eq("lender_id", lender.lenderId).eq("user_id", p.data.userId);
  if (error) return { ok: false, message: "No hemos podido quitarle del equipo." };
  await audit(lender, "member.removed", { user_id: p.data.userId, role: current });
  revalidatePath("/ajustes");
  return { ok: true };
}
