/**
 * Retention purge (daily cron, 0026): closed cases whose lender's retention period has ended are announced 14 days
 * ahead (Bandeja item + one email per lender to its owners) and deleted on the announced date, with the same
 * files-then-rows order as «Eliminar caso». One audit row stays per deleted case, with no company data. Rules in
 * ./closing.ts (`purgeStep`). Server-only (service role).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { caseRef, formatDay } from "../format.ts";
import type { Notifier } from "../notify.ts";
import { removeCaseFiles } from "./case-files.ts";
import { purgeStep } from "./closing.ts";

/** Deletions per run (each lists and removes the case's files); the rest go on the next run. */
const PURGE_BATCH = 25;

interface ClosedCase {
  id: string;
  lender_id: string;
  borrower_name: string | null;
  borrower_cif: string;
  closed_at: string;
  purge_warned_at: string | null;
  purge_warned_for: string | null;
  lenders: { retention_months: number } | null;
}

export interface PurgeRun {
  warned: number;
  emailed: number;
  purged: string[];
  failed: string[];
}

export async function runRetentionPurge(admin: SupabaseClient, notifier: Notifier, opts: { now?: Date; budgetMs?: number } = {}): Promise<PurgeRun> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const run: PurgeRun = { warned: 0, emailed: 0, purged: [], failed: [] };
  const { data, error } = await admin
    .from("cases")
    .select("id, lender_id, borrower_name, borrower_cif, closed_at, purge_warned_at, purge_warned_for, lenders(retention_months)")
    .eq("status", "archived")
    .not("closed_at", "is", null)
    .order("closed_at")
    .limit(2000);
  if (error) {
    console.error("[purge] closed cases not read:", error.code ?? "unknown");
    return run;
  }

  const warnings = new Map<string, { caseId: string; companyName: string; purgeOn: string }[]>();
  const due: { kase: ClosedCase; purgeOn: string }[] = [];
  for (const kase of (data ?? []) as unknown as ClosedCase[]) {
    if (!kase.lenders) continue;
    const step = purgeStep({ closedAt: kase.closed_at, retentionMonths: kase.lenders.retention_months, warnedAt: kase.purge_warned_at, warnedFor: kase.purge_warned_for }, now);
    if (step.step === "purge") due.push({ kase, purgeOn: step.purgeOn });
    if (step.step !== "warn") continue;
    const { data: rows } = await admin
      .from("cases")
      .update({ purge_warned_at: now.toISOString(), purge_warned_for: step.purgeOn })
      .eq("id", kase.id)
      .eq("status", "archived")
      .select("id");
    if (!rows?.length) continue;
    await admin.from("audit_log").insert({ lender_id: kase.lender_id, case_id: kase.id, actor: "system", action: "case.purge_scheduled", detail: { purge_on: step.purgeOn } });
    run.warned++;
    const list = warnings.get(kase.lender_id) ?? [];
    list.push({ caseId: kase.id, companyName: kase.borrower_name ?? kase.borrower_cif, purgeOn: formatDay(step.purgeOn) });
    warnings.set(kase.lender_id, list);
  }

  for (const [lenderId, cases] of warnings) {
    const { sent } = await notifier.notifyPurgeScheduled({ lenderId, cases }).catch(() => ({ sent: false }));
    if (sent) run.emailed++;
  }

  for (const { kase, purgeOn } of due.slice(0, PURGE_BATCH)) {
    if (opts.budgetMs !== undefined && Date.now() - started > opts.budgetMs) break;
    (await purgeCase(admin, kase, purgeOn, now)) ? run.purged.push(kase.id) : run.failed.push(kase.id);
  }
  return run;
}

/** Deletes one announced case: files first; if any cannot be removed, the rows stay and the next run tries again. */
async function purgeCase(admin: SupabaseClient, kase: ClosedCase, purgeOn: string, now: Date): Promise<boolean> {
  // Still closed with the same announcement? (Someone may have reopened it since the list was read.)
  const { data: fresh } = await admin.from("cases").select("id").eq("id", kase.id).eq("status", "archived").eq("purge_warned_for", purgeOn).maybeSingle();
  if (!fresh) return false;
  const [docs, memos] = await Promise.all([
    admin.from("documents").select("storage_path").eq("case_id", kase.id),
    admin.from("memos").select("storage_path").eq("case_id", kase.id),
  ]);
  if (docs.error || memos.error) return false;
  const files = await removeCaseFiles(admin, kase.id, [...(docs.data ?? []).map((d) => d.storage_path as string), ...(memos.data ?? []).map((m) => m.storage_path as string)]);
  if (!files.ok) {
    console.error(`[purge] files of ${caseRef(kase.id)} not removed: ${files.reason}`);
    return false;
  }
  const { data: deleted, error } = await admin.from("cases").delete().eq("id", kase.id).eq("status", "archived").select("id");
  if (error || !deleted?.length) {
    console.error(`[purge] ${caseRef(kase.id)}: files removed, rows not deleted (${error?.code ?? "no row"})`);
    return false;
  }
  // The case's audit rows went with it (cascade). This one stays: no company name or CIF, only what proves the deletion.
  await admin.from("audit_log").insert({
    lender_id: kase.lender_id,
    case_id: null,
    actor: "system",
    action: "case.purged",
    detail: { case_id: kase.id, case_ref: caseRef(kase.id), closed_at: kase.closed_at, retention_months: kase.lenders?.retention_months ?? null, purge_on: purgeOn, files_removed: files.removed, at: now.toISOString() },
  });
  return true;
}
