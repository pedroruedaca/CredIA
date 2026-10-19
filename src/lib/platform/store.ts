/** Platform admin reads and writes across lenders, with the service role. Callers must check isPlatformAdmin first. */
import "server-only";
import { removeCaseFiles } from "../cases/case-files.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { findOrCreateUser } from "../team.ts";
import { accountsToRemove } from "./admin.ts";

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

export type DeleteLenderResult =
  | { ok: true; name: string; cases: number; filesRemoved: number; accountsRemoved: number; accountsKept: number }
  | { ok: false; message: string };

/**
 * «Eliminar entidad»: a lender and everything in it, for good. Files of every case first (as «Eliminar caso»); if any
 * cannot be removed, no row is deleted and the admin can try again. Then the lender row: team, cases and everything
 * under them, templates, policies and its audit rows go with it (every table cascades from lenders). Then the
 * members' sign-in accounts (accountsToRemove). Callers check isPlatformAdmin, the typed name and the admin's own lender.
 */
export async function deleteLenderEverything(lenderId: string): Promise<DeleteLenderResult> {
  const db = createAdminClient();
  const { data: lender } = await db.from("lenders").select("id, name").eq("id", lenderId).maybeSingle();
  if (!lender) return { ok: false, message: "Esa entidad ya no existe." };

  const [cases, docs, memos, members] = await Promise.all([
    db.from("cases").select("id").eq("lender_id", lenderId),
    db.from("documents").select("case_id, storage_path").eq("lender_id", lenderId),
    db.from("memos").select("case_id, storage_path").eq("lender_id", lenderId),
    db.from("lender_members").select("user_id").eq("lender_id", lenderId),
  ]);
  if (cases.error || docs.error || memos.error || members.error) return { ok: false, message: "No hemos podido preparar el borrado. No se ha borrado nada." };

  let filesRemoved = 0;
  for (const { id: caseId } of cases.data ?? []) {
    const named = [...(docs.data ?? []), ...(memos.data ?? [])].filter((r) => r.case_id === caseId).map((r) => r.storage_path as string | null);
    const files = await removeCaseFiles(db, caseId, named);
    if (!files.ok) {
      return {
        ok: false,
        message: filesRemoved === 0 && files.reason === "list_failed"
          ? "No hemos podido leer los archivos de la entidad. No se ha borrado nada."
          : "No hemos podido borrar todos los archivos de la entidad. Vuelve a intentarlo; sus datos siguen intactos.",
      };
    }
    filesRemoved += files.removed;
  }

  const { data: deleted, error } = await db.from("lenders").delete().eq("id", lenderId).select("id");
  if (error || !deleted?.length) return { ok: false, message: "Se han borrado los archivos, pero no los datos de la entidad. Vuelve a intentarlo." };

  // Accounts: the lender's members, once their membership is gone with it.
  const ids = [...new Set((members.data ?? []).map((m) => m.user_id as string))];
  const people = await Promise.all(ids.map(async (userId) => ({ userId, email: (await db.auth.admin.getUserById(userId)).data.user?.email ?? null })));
  const { data: still } = ids.length ? await db.from("lender_members").select("user_id").in("user_id", ids) : { data: [] };
  const remove = accountsToRemove(people, new Set((still ?? []).map((m) => m.user_id as string)));
  let accountsRemoved = 0;
  for (const userId of remove) if (!(await db.auth.admin.deleteUser(userId)).error) accountsRemoved++;

  return { ok: true, name: lender.name, cases: cases.data?.length ?? 0, filesRemoved, accountsRemoved, accountsKept: ids.length - accountsRemoved };
}
