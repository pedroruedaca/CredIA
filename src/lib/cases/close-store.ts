/**
 * Closing cases in the database (0025). Server-only: Holded keys and the activity query need the service role.
 * The rules are pure in ./closing.ts.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { closeUpdate, inactiveCases, type OpenCaseActivity } from "./closing.ts";

/** At most this many cases are closed per cron run; the rest close on the next run. */
const AUTO_CLOSE_BATCH = 200;

/**
 * A closed case needs no stored Holded key: refresh-mode keys are destroyed (as «Revocar acceso» does). Data already
 * imported stays with the case. Returns how many keys were destroyed.
 */
export async function destroyStoredHoldedKeys(admin: SupabaseClient, caseId: string, now = new Date()): Promise<number> {
  const { data } = await admin
    .from("holded_connections")
    .update({ token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: now.toISOString() })
    .eq("case_id", caseId)
    .is("revoked_at", null)
    .not("token_ciphertext", "is", null)
    .select("id");
  return data?.length ?? 0;
}

/**
 * Daily cron: closes open cases with no activity from a person for their lender's `auto_close_months` (reason
 * `inactive`), destroys their stored Holded keys and records `case.closed` as the system. Returns the cases closed.
 */
export async function closeInactiveCases(admin: SupabaseClient, now = new Date()): Promise<string[]> {
  const { data, error } = await admin.rpc("open_case_activity");
  if (error) {
    console.error("[auto-close] activity not read:", error.code ?? "unknown");
    return [];
  }
  const idle = inactiveCases((data ?? []) as OpenCaseActivity[], now).slice(0, AUTO_CLOSE_BATCH);
  const closed: string[] = [];
  for (const c of idle) {
    // Only if still open: an analyst may have closed or touched it since the activity was read.
    const { data: rows } = await admin.from("cases").update(closeUpdate("inactive", now)).eq("id", c.case_id).neq("status", "archived").select("id");
    if (!rows?.length) continue;
    const keys = await destroyStoredHoldedKeys(admin, c.case_id, now);
    await admin.from("audit_log").insert({
      lender_id: c.lender_id,
      case_id: c.case_id,
      actor: "system",
      action: "case.closed",
      detail: { reason: "inactive", last_activity: c.last_activity, months: c.auto_close_months, holded_keys_destroyed: keys },
    });
    closed.push(c.case_id);
  }
  return closed;
}
