/**
 * Audit of lender reads of a case. Every page that shows case data records who looked and when; repeated views
 * by the same person within a short window (navigating between alerts, refreshing) are recorded once.
 * Server-only: uses the lender's RLS client, so a row can only be written for a case the lender can see.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LenderContext } from "./lender.ts";

export const READ_DEDUPE_MINUTES = 15;

export async function logCaseRead(
  db: SupabaseClient,
  lender: Pick<LenderContext, "lenderId" | "userId">,
  caseId: string,
  action: "case.viewed" | "case.tables_viewed",
  now = new Date(),
): Promise<void> {
  const since = new Date(now.getTime() - READ_DEDUPE_MINUTES * 60_000).toISOString();
  const { data: recent } = await db
    .from("audit_log")
    .select("id")
    .eq("case_id", caseId)
    .eq("actor", lender.userId)
    .eq("action", action)
    .gte("at", since)
    .limit(1);
  if (recent?.length) return;
  await db.from("audit_log").insert({ lender_id: lender.lenderId, case_id: caseId, actor: lender.userId, action, detail: {} });
}
