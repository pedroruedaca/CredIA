/** Who at a lender receives notices: owners and analysts by default (never viewers). Server-only (service role). */
import "server-only";
import { createAdminClient } from "../supabase/admin.ts";

export async function lenderRecipients(lenderId: string, roles: readonly ("owner" | "analyst")[] = ["owner", "analyst"]): Promise<string[]> {
  const db = createAdminClient();
  const { data: members } = await db.from("lender_members").select("user_id").eq("lender_id", lenderId).in("role", [...roles]);
  const emails = await Promise.all(
    (members ?? []).map(async (m) => (await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? null),
  );
  return [...new Set(emails.filter((e): e is string => !!e))];
}
