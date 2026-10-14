"use server";

/** Platform admin: create a lender and its first owner. Only emails in CREDIA_ADMIN_EMAILS; anyone else gets a 404. */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { appBaseUrl } from "@/lib/app-url";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { isPlatformAdmin, parseNewLender, type NewLenderErrors } from "@/lib/platform/admin";
import { createLenderWithOwner } from "@/lib/platform/store";
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

  const { sent } = await getNotifier().sendTeamInvite({ to: ownerEmail, lenderName: name, invitedBy: user.email ?? "credIA", role: "owner", loginUrl: `${await appBaseUrl()}/login` });
  revalidatePath("/admin");
  return {
    status: "created",
    message: sent
      ? `«${name}» creada. Hemos enviado la invitación a ${ownerEmail}.`
      : `«${name}» creada y ${ownerEmail} ya tiene acceso, pero ${isEmailConfigured() ? "no se ha podido enviar el correo" : "no hay correo configurado"}: avísale tú de que entre en credIA con ese correo.`,
  };
}
