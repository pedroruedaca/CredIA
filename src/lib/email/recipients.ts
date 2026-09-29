/** Who at a lender receives case notices: owners and analysts (not viewers). Server-only (service role). */
import "server-only";
import { createAdminClient } from "../supabase/admin.ts";

export async function lenderRecipients(lenderId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data: members } = await db.from("lender_members").select("user_id").eq("lender_id", lenderId).in("role", ["owner", "analyst"]);
  const emails = await Promise.all(
    (members ?? []).map(async (m) => (await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? null),
  );
  return [...new Set(emails.filter((e): e is string => !!e))];
}
