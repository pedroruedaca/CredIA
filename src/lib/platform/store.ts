/** Platform admin reads and writes across lenders, with the service role. Callers must check isPlatformAdmin first. */
import "server-only";
import { createAdminClient } from "../supabase/admin.ts";
import { findOrCreateUser } from "../team.ts";

export interface LenderSummary {
  id: string;
  name: string;
  createdAt: string;
  owners: string[];
  members: number;
  cases: number;
}

/** Every lender, newest first, with its owners' emails and how many members and cases it has. */
export async function listLenders(): Promise<LenderSummary[]> {
  const db = createAdminClient();
  const { data } = await db.from("lenders").select("id, name, created_at, lender_members(user_id, role), cases(count)").order("created_at", { ascending: false });
  type Row = { id: string; name: string; created_at: string; lender_members: { user_id: string; role: string }[] | null; cases: { count: number }[] | null };
  return Promise.all(
    ((data ?? []) as Row[]).map(async (l) => {
      const members = l.lender_members ?? [];
      const owners = await Promise.all(members.filter((m) => m.role === "owner").map(async (m) => (await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? "(sin correo)"));
      return { id: l.id, name: l.name, createdAt: l.created_at, owners: owners.sort(), members: members.length, cases: l.cases?.[0]?.count ?? 0 };
    }),
  );
}

export type CreateLenderResult = { ok: true; lenderId: string; userCreated: boolean } | { ok: false; message: string };

/**
 * Creates a lender and makes the user with this email its owner (creating the user if needed, as team invitations do).
 * A person belongs to one lender: an email already in a lender is refused. All or nothing.
 */
export async function createLenderWithOwner(name: string, ownerEmail: string): Promise<CreateLenderResult> {
  const user = await findOrCreateUser(ownerEmail);
  if ("error" in user) return { ok: false, message: "No hemos podido crear o encontrar el usuario. Inténtalo de nuevo." };
  const db = createAdminClient();
  const { data: existing } = await db.from("lender_members").select("lender_id, lenders(name)").eq("user_id", user.userId);
  if (existing?.length) {
    const other = (existing[0].lenders as unknown as { name: string } | null)?.name;
    return { ok: false, message: `${ownerEmail} ya pertenece a ${other ? `«${other}»` : "otra entidad"}. Cada persona pertenece a una sola entidad.` };
  }
  const { data: lender, error } = await db.from("lenders").insert({ name }).select("id").single();
  if (error || !lender) return { ok: false, message: "No hemos podido crear la entidad. Inténtalo de nuevo." };
  const { error: memberErr } = await db.from("lender_members").insert({ lender_id: lender.id, user_id: user.userId, role: "owner" });
  if (memberErr) {
    await db.from("lenders").delete().eq("id", lender.id);
    return { ok: false, message: "No hemos podido dar acceso a la persona administradora. No se ha creado nada." };
  }
  return { ok: true, lenderId: lender.id, userCreated: user.created };
}
