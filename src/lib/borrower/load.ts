/** Loads everything the borrower portal shows for one case. Server-only (service role, token already checked). */
import "server-only";
import { todayMadrid } from "../format.ts";
import type { AdminClient, BorrowerAccess } from "./access.ts";
import { buildChecklist, type Checklist, type ChecklistDocument, type ChecklistHolded, type ChecklistHoldedPeriod, type ChecklistInput } from "./checklist.ts";

export interface PortalCase {
  id: string;
  companyName: string;
  requestedProduct: string | null;
  requestedAmount: number | null;
  fiscalYearEnd: string | null;
  status: string;
  submittedAt: string | null;
  lenderName: string;
  lenderBrandColor: string | null;
}

export interface PortalData {
  kase: PortalCase;
  checklist: Checklist;
  requirementsByKind: Record<string, { required: boolean; maxAgeDays: number | null }>;
  holded: ChecklistHolded[];
  today: string;
}

export async function loadPortal(db: AdminClient, access: BorrowerAccess, now = new Date()): Promise<PortalData | null> {
  const [caseRes, reqRes, docRes, holdedRes] = await Promise.all([
    db
      .from("cases")
      .select("id, borrower_name, requested_product, requested_amount, fiscal_year_end, status, submitted_at, lenders(name, brand_color)")
      .eq("id", access.caseId)
      .single(),
    db.from("case_requirements").select("doc_kind, required, max_age_days").eq("case_id", access.caseId),
    db
      .from("documents")
      .select("id, kind, status, original_filename, issued_on, attention_message, uploaded_at, extractions(summary, created_at)")
      .eq("case_id", access.caseId)
      // Reports the lender uploads itself (e.g. its own Experian report) are not the company's to see.
      .neq("uploaded_by", "lender")
      .order("uploaded_at", { ascending: false }),
    db
      .from("holded_connections")
      .select("id, status, mode, revoked_at, created_at, holded_syncs(period_kind, period_start, period_end, created_at)")
      .eq("case_id", access.caseId)
      .order("created_at", { ascending: false }),
  ]);
  if (caseRes.error || !caseRes.data || reqRes.error || docRes.error || holdedRes.error) return null;

  const c = caseRes.data;
  const lender = c.lenders as unknown as { name: string; brand_color: string | null } | null;
  const holded: ChecklistHolded[] = (holdedRes.data ?? []).map((h) => ({
    id: h.id,
    status: h.status,
    mode: h.mode,
    revoked_at: h.revoked_at,
    created_at: h.created_at,
    periods: latestPeriods((h.holded_syncs ?? []) as SyncRow[]),
  }));

  const today = todayMadrid(now);
  const input: ChecklistInput = {
    lenderName: lender?.name ?? "la entidad",
    requirements: reqRes.data ?? [],
    documents: (docRes.data ?? []).map(({ extractions, ...d }) => ({
      ...d,
      // Latest extraction's summary (e.g. detected period), if processing has run.
      summary: ([...((extractions as { summary: ChecklistDocument["summary"]; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.summary) ?? null,
    })),
    holded,
    today,
    now,
  };

  return {
    kase: {
      id: c.id,
      companyName: c.borrower_name ?? "",
      requestedProduct: c.requested_product,
      requestedAmount: c.requested_amount === null ? null : Number(c.requested_amount),
      fiscalYearEnd: c.fiscal_year_end,
      status: c.status,
      submittedAt: c.submitted_at,
      lenderName: lender?.name ?? "",
      lenderBrandColor: lender?.brand_color ?? null,
    },
    checklist: buildChecklist(input),
    requirementsByKind: Object.fromEntries((reqRes.data ?? []).map((r) => [r.doc_kind, { required: r.required, maxAgeDays: r.max_age_days }])),
    holded,
    today,
  };
}

interface SyncRow {
  period_kind: "closed_fy" | "ytd";
  period_start: string;
  period_end: string;
  created_at: string;
}

function latestPeriods(syncs: SyncRow[]): ChecklistHoldedPeriod[] {
  const latest = new Map<string, SyncRow>();
  for (const s of syncs) {
    const prev = latest.get(s.period_kind);
    if (!prev || s.created_at > prev.created_at) latest.set(s.period_kind, s);
  }
  return [...latest.values()].map((s) => ({ kind: s.period_kind, start: s.period_start, end: s.period_end }));
}
