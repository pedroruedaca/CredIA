"use server";

/** Platform admin: create a lender and its first owner. Only emails in CREDIA_ADMIN_EMAILS; anyone else gets a 404. */
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { appBaseUrl } from "@/lib/app-url";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { confirmsLenderName, isPlatformAdmin, parseNewLender, type NewLenderErrors } from "@/lib/platform/admin";
import { createLenderWithOwner, deleteLenderEverything } from "@/lib/platform/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type NewLenderState =
  | { status: "idle" }
  | { status: "invalid"; errors: NewLenderErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> }
  | { status: "created"; message: string };

export async function createLender(_prev: NewLenderState, fd: FormData): Promise<NewLenderState> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) notFound();
  const values = { name: String(fd.get("name") ?? ""), ownerEmail: String(fd.get("ownerEmail") ?? "") };
  const parsed = parseNewLender(values);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const { name, ownerEmail } = parsed.data;

  const r = await createLenderWithOwner(name, ownerEmail);
  if (!r.ok) return { status: "failed", message: r.message, values };
  await createAdminClient().from("audit_log").insert({ lender_id: r.lenderId, case_id: null, actor: user.id, action: "lender.created", detail: { by_platform_admin: user.email, owner_email: ownerEmail, user_created: r.userCreated } });

  const { sent } = await getNotifier().sendLenderWelcome({ to: ownerEmail, lenderName: name, loginUrl: `${await appBaseUrl()}/login` });
  revalidatePath("/admin");
  return {
    status: "created",
    message: sent
      ? `«${name}» creada. Hemos enviado la bienvenida a ${ownerEmail}.`
      : `«${name}» creada y ${ownerEmail} ya tiene acceso, pero ${isEmailConfigured() ? "no se ha podido enviar el correo" : "no hay correo configurado"}: avísale tú de que entre en credIA con ese correo.`,
  };
}

export type DeleteLenderResult = { ok: false; message: string };

/** «Eliminar entidad»: platform admins only, confirmed with the lender's name, never the admin's own lender. Redirects on success. */
export async function deleteLender(lenderId: string, typedName: string): Promise<DeleteLenderResult> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) notFound();
  if (typeof lenderId !== "string" || !/^[0-9a-f-]{36}$/i.test(lenderId) || typeof typedName !== "string") return { ok: false, message: "Entidad no encontrada." };

  const admin = createAdminClient();
  const [{ data: lender }, { data: own }] = await Promise.all([
    admin.from("lenders").select("name").eq("id", lenderId).maybeSingle(),
    admin.from("lender_members").select("lender_id").eq("user_id", user.id).eq("lender_id", lenderId),
  ]);
  if (!lender) return { ok: false, message: "Esa entidad ya no existe." };
  if (own?.length) return { ok: false, message: "No puedes eliminar la entidad a la que perteneces." };
  if (!confirmsLenderName(typedName, lender.name)) return { ok: false, message: "El nombre no coincide con el de la entidad." };

  const r = await deleteLenderEverything(lenderId);
  if (!r.ok) return r;
  // The lender's own audit rows went with it; this one stays (lender_id null), readable only with the service role.
  await admin.from("audit_log").insert({
    lender_id: null,
    case_id: null,
    actor: user.id,
    action: "lender.deleted",
    detail: { by_platform_admin: user.email, lender_id: lenderId, name: r.name, cases: r.cases, files_removed: r.filesRemoved, accounts_removed: r.accountsRemoved, accounts_kept: r.accountsKept },
  });
  revalidatePath("/admin");
  redirect("/admin?eliminada=1");
}
