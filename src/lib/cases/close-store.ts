/**
 * Closing cases in the database (0025). Server-only: Holded keys, raw ledgers and the activity query need the service
 * role.
 * The rules are pure in ./closing.ts.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_BUCKET, listAll } from "../storage/list.ts";
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
 * Holded raw ledgers (`raw/holded/<case>/<sync>.json`: every imported ledger line, with the closing-entry decisions) are
 * audit evidence while the lender studies the case. Nothing recomputes from them (statements come from
 * `ledger_balances`), so once the case is closed they go. Returns how many files were removed, or null if the listing
 * or the removal failed (the next closing or the purge removes them).
 */
export async function removeHoldedRawLedgers(admin: SupabaseClient, caseId: string): Promise<number | null> {
  const files = await listAll(admin, `raw/holded/${caseId}`);
  if (files === null) return null;
  for (let i = 0; i < files.length; i += 100) {
    if ((await admin.storage.from(CASE_BUCKET).remove(files.slice(i, i + 100))).error) return null;
  }
  if (files.length) {
    const { data: conns } = await admin.from("holded_connections").select("id").eq("case_id", caseId);
    const ids = (conns ?? []).map((c) => c.id as string);
    if (ids.length) await admin.from("holded_syncs").update({ raw_storage_path: null }).in("connection_id", ids);
  }
  return files.length;
}

/** What closing a case releases: stored Holded keys and the Holded raw ledgers. */
export async function releaseOnClose(admin: SupabaseClient, caseId: string, now = new Date()): Promise<{ holded_keys_destroyed: number; holded_raw_files_removed: number | null }> {
  const keys = await destroyStoredHoldedKeys(admin, caseId, now);
  const raw = await removeHoldedRawLedgers(admin, caseId);
  if (raw === null) console.error("[close] Holded raw ledgers not removed; the purge will remove them");
  return { holded_keys_destroyed: keys, holded_raw_files_removed: raw };
}

/**
 * Daily cron: closes open cases with no activity from a person for their lender's `auto_close_months` (reason
 * `inactive`), releases what closing releases (`releaseOnClose`) and records `case.closed` as the system. Returns the cases closed.
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
    const released = await releaseOnClose(admin, c.case_id, now);
    await admin.from("audit_log").insert({
      lender_id: c.lender_id,
      case_id: c.case_id,
      actor: "system",
      action: "case.closed",
      detail: { reason: "inactive", last_activity: c.last_activity, months: c.auto_close_months, ...released },
    });
    closed.push(c.case_id);
  }
  return closed;
}
