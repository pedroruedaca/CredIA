/**
 * Finds cases stuck in processing (see stuck.ts) and runs them again. Server-only, service role: the lender's client
 * cannot read the lock columns, so callers pass case ids the lender has already loaded through RLS (or none, for the
 * daily sweep).
 */
import "server-only";
import type { AdminClient } from "../borrower/access.ts";
import { processCase } from "./process-case.ts";
import { stuckReason, type CaseProcessingState, type StuckReason } from "./stuck.ts";

type Row = Omit<CaseProcessingState, "documents"> & {
  id: string;
  documents: { status: string; uploaded_at: string; processing_started_at: string | null; extractions: { id: string }[] | null }[] | null;
};

export async function stuckCases(db: AdminClient, caseIds?: string[], now = new Date()): Promise<{ id: string; reason: StuckReason }[]> {
  if (caseIds && caseIds.length === 0) return [];
  let q = db
    .from("cases")
    .select("id, status, submitted_at, processing_lock_until, processing_requested, processed_at, documents(status, uploaded_at, processing_started_at, extractions(id))")
    .neq("status", "archived");
  q = caseIds ? q.in("id", caseIds) : q.gte("updated_at", new Date(now.getTime() - 60 * 86_400_000).toISOString()).limit(500);
  const { data } = await q;
  return ((data ?? []) as unknown as Row[]).flatMap((c) => {
    const reason = stuckReason({ ...c, documents: (c.documents ?? []).map((d) => ({ ...d, extractions: d.extractions?.length ?? 0 })) }, now);
    return reason ? [{ id: c.id, reason }] : [];
  });
}

/** Runs stuck cases one after another, stopping before `budgetMs` so the caller's request can finish. */
export async function runStuck(db: AdminClient, stuck: { id: string }[], budgetMs: number): Promise<string[]> {
  const started = Date.now();
  const ran: string[] = [];
  for (const c of stuck) {
    if (Date.now() - started > budgetMs) break;
    await processCase(db, c.id);
    ran.push(c.id);
  }
  return ran;
}
