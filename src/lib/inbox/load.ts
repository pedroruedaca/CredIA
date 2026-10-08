/** Loads the Bandeja for the signed-in lender through their RLS client. Server-only. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInbox, INBOX_WINDOW_DAYS, type InboxInput } from "./build.ts";

type CaseRef = { borrower_name: string | null; borrower_cif: string } | null;
const company = (c: CaseRef) => c?.borrower_name ?? c?.borrower_cif ?? "Empresa";

export async function loadInbox(db: SupabaseClient, now = new Date()) {
  const since = new Date(now.getTime() - INBOX_WINDOW_DAYS * 86_400_000).toISOString();
  const [support, cases, docs, registry, purge] = await Promise.all([
    db
      .from("support_requests")
      .select("id, case_id, actor, message, status, created_at, cases(borrower_name, borrower_cif)")
      .or(`status.eq.open,created_at.gte."${since}"`)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("cases")
      .select("id, borrower_name, borrower_cif, submitted_at, consent_withdrawn_at")
      .or(`submitted_at.gte."${since}",consent_withdrawn_at.gte."${since}"`)
      .limit(500),
    db
      .from("documents")
      .select("id, case_id, kind, uploaded_at, cases(borrower_name, borrower_cif)")
      .eq("status", "needs_review")
      .order("uploaded_at", { ascending: false })
      .limit(200),
    db
      .from("audit_log")
      .select("id, case_id, at, detail, cases(borrower_name, borrower_cif)")
      .eq("action", "borme.new_acts")
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(200),
    db
      .from("audit_log")
      .select("id, case_id, at, detail, cases(borrower_name, borrower_cif)")
      .eq("action", "case.purge_scheduled")
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(200),
  ]);
  const caseIds = [
    ...new Set([...(cases.data ?? []).map((c) => c.id), ...(registry.data ?? []).map((r) => r.case_id as string), ...(purge.data ?? []).map((p) => p.case_id as string)]),
  ];
  const views = caseIds.length
    ? await db.from("audit_log").select("case_id, at").eq("action", "case.viewed").in("case_id", caseIds).gte("at", since)
    : { data: [] as { case_id: string; at: string }[] };

  const input: InboxInput = {
    support: (support.data ?? []).map((s) => ({ ...s, company: company(s.cases as unknown as CaseRef) })) as InboxInput["support"],
    cases: (cases.data ?? []).map((c) => ({ id: c.id, company: c.borrower_name ?? c.borrower_cif, submitted_at: c.submitted_at, consent_withdrawn_at: c.consent_withdrawn_at })),
    views: (views.data ?? []) as InboxInput["views"],
    needsReview: (docs.data ?? []).map((d) => ({ id: d.id, case_id: d.case_id, kind: d.kind, uploaded_at: d.uploaded_at, company: company(d.cases as unknown as CaseRef) })),
    registry: (registry.data ?? []).map((r) => ({
      id: String(r.id),
      case_id: r.case_id as string,
      at: r.at,
      company: company(r.cases as unknown as CaseRef),
      acts: ((r.detail as { acts?: { label: string; severity: "high" | "warn" | "info" | null }[] } | null)?.acts ?? []).map((a) => ({ label: a.label, severity: a.severity })),
    })),
    purge: (purge.data ?? []).map((p) => ({
      id: String(p.id),
      case_id: p.case_id as string,
      at: p.at,
      company: company(p.cases as unknown as CaseRef),
      purge_on: (p.detail as { purge_on?: string } | null)?.purge_on ?? "",
    })),
  };
  return { ...buildInbox(input, now), failed: !!(support.error || cases.error || docs.error) };
}

/** Just the pending count, for the rail badge. */
export async function inboxPendingCount(db: SupabaseClient): Promise<number> {
  try {
    return (await loadInbox(db)).pendingCount;
  } catch {
    return 0;
  }
}
