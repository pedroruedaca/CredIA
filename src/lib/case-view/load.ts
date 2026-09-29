/** Loads everything the lender case view, exports and PDF show. Server-only; uses the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kpi } from "../kpis/engine.ts";
import type { CanonicalStatement } from "../pgc/mapping.ts";
import type { CirbeExtraction } from "../schema/canonical.ts";
import type { CheckRow, SourceDoc } from "./present.ts";

const KPI_UNIT: Record<string, Kpi["unit"]> = {
  revenue: "EUR", ebitda: "EUR", workingCapital: "EUR", financialDebt: "EUR", netDebt: "EUR", ebitdaMargin: "%", dso: "days", dpo: "days",
};

export interface CaseViewData {
  kase: {
    id: string;
    lenderName: string;
    companyName: string;
    cif: string;
    status: string;
    fiscalYearEnd: string | null;
    product: string | null;
    amount: number | null;
    termMonths: number | null;
    borrowerEmail: string | null;
    linkExpiresAt: string | null;
    submittedAt: string | null;
    consentWithdrawnAt: string | null;
    processedAt: string | null;
    createdAt: string;
  };
  statements: { closed: CanonicalStatement | null; ytd: CanonicalStatement | null; closedSource: string | null; ytdSource: string | null };
  kpis: { closed: Kpi[]; ytd: Kpi[] };
  checks: CheckRow[];
  reviews: Record<string, { status: "open" | "reviewed" | "clarification_requested"; note: string | null; at: string }>;
  documents: (SourceDoc & { status: string; uploaded_at: string; attention_message: string | null; summary: Record<string, unknown> | null })[];
  requirements: { doc_kind: string; required: boolean; max_age_days: number | null }[];
  cirbe: CirbeExtraction | null;
  cirbeDocId: string | null;
  holded: { status: string; mode: string; lastSyncAt: string | null; entries: number } | null;
  activity: { action: string; actor: string; at: string; detail: Record<string, unknown> }[];
}

export async function loadCaseView(db: SupabaseClient, caseId: string): Promise<CaseViewData | null> {
  const { data: c } = await db
    .from("cases")
    .select(
      "id, borrower_cif, borrower_name, status, fiscal_year_end, requested_product, requested_amount, requested_term_months, borrower_email, borrower_token_expires_at, submitted_at, consent_withdrawn_at, processed_at, created_at, lenders(name)",
    )
    .eq("id", caseId)
    .maybeSingle();
  if (!c) return null;

  const [stmts, checks, reviews, docs, reqs, debt, holded, activity] = await Promise.all([
    db.from("financial_statements").select("period_kind, statement, source, kpis(key, value, formula, inputs, note)").eq("case_id", caseId),
    db.from("checks").select("id, check_key, status, severity, message, evidence, source, document_id").eq("case_id", caseId).order("id"),
    db.from("check_reviews").select("check_key, status, note, at").eq("case_id", caseId).order("at", { ascending: false }),
    db
      .from("documents")
      .select("id, kind, status, original_filename, uploaded_at, issued_on, attention_message, extractions(summary, created_at)")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false }),
    db.from("case_requirements").select("doc_kind, required, max_age_days").eq("case_id", caseId),
    db.from("debt_positions").select("document_id, as_of, entity, product, drawn, limit_amount, overdue, maturity, source_ref").eq("case_id", caseId),
    db.from("holded_connections").select("status, mode, last_sync_at, created_at, holded_syncs(entries_fetched, created_at)").eq("case_id", caseId).order("created_at", { ascending: false }),
    db.from("audit_log").select("action, actor, at, detail").eq("case_id", caseId).order("at", { ascending: false }).limit(40),
  ]);

  type StmtRow = { period_kind: "closed_fy" | "ytd"; statement: CanonicalStatement; source: string | null; kpis: { key: Kpi["key"]; value: number | null; formula: string; inputs: Record<string, number>; note: string | null }[] };
  const rows = (stmts.data ?? []) as StmtRow[];
  const pick = (k: StmtRow["period_kind"]) => rows.find((r) => r.period_kind === k) ?? null;
  const toKpis = (r: StmtRow | null): Kpi[] =>
    (r?.kpis ?? []).map((k) => ({ key: k.key, value: k.value === null ? null : Number(k.value), unit: KPI_UNIT[k.key] ?? "x", formula: k.formula, inputs: k.inputs, note: k.note ?? undefined }));

  const latestReview: CaseViewData["reviews"] = {};
  for (const r of reviews.data ?? []) if (!latestReview[r.check_key]) latestReview[r.check_key] = { status: r.status, note: r.note, at: r.at };

  const debtRows = debt.data ?? [];
  const cirbe: CirbeExtraction | null = debtRows.length
    ? {
        nif: c.borrower_cif,
        asOf: debtRows[0].as_of,
        positions: debtRows.map((p) => ({
          entity: p.entity,
          product: p.product ?? "",
          drawn: Number(p.drawn ?? 0),
          limit: p.limit_amount === null ? null : Number(p.limit_amount),
          overdue: Number(p.overdue ?? 0),
          maturity: p.maturity,
          page: Number(/:page:(\d+)/.exec(p.source_ref)?.[1] ?? 1),
        })),
      }
    : null;

  const h = (holded.data ?? []).find((x) => x.status === "synced") ?? (holded.data ?? [])[0] ?? null;
  const syncs = (h?.holded_syncs as { entries_fetched: number; created_at: string }[] | undefined) ?? [];
  const lender = c.lenders as unknown as { name: string } | null;

  return {
    kase: {
      id: c.id,
      lenderName: lender?.name ?? "",
      companyName: c.borrower_name ?? c.borrower_cif,
      cif: c.borrower_cif,
      status: c.status,
      fiscalYearEnd: c.fiscal_year_end,
      product: c.requested_product,
      amount: c.requested_amount === null ? null : Number(c.requested_amount),
      termMonths: c.requested_term_months,
      borrowerEmail: c.borrower_email,
      linkExpiresAt: c.borrower_token_expires_at,
      submittedAt: c.submitted_at,
      consentWithdrawnAt: c.consent_withdrawn_at,
      processedAt: c.processed_at,
      createdAt: c.created_at,
    },
    statements: { closed: pick("closed_fy")?.statement ?? null, ytd: pick("ytd")?.statement ?? null, closedSource: pick("closed_fy")?.source ?? null, ytdSource: pick("ytd")?.source ?? null },
    kpis: { closed: toKpis(pick("closed_fy")), ytd: toKpis(pick("ytd")) },
    checks: (checks.data ?? []) as CheckRow[],
    reviews: latestReview,
    documents: (docs.data ?? []).map(({ extractions, ...d }) => ({
      ...d,
      summary: [...((extractions as { summary: Record<string, unknown>; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.summary ?? null,
    })),
    requirements: reqs.data ?? [],
    cirbe,
    cirbeDocId: debtRows[0]?.document_id ?? null,
    holded: h ? { status: h.status, mode: h.mode, lastSyncAt: h.last_sync_at, entries: syncs.reduce((s, x) => s + (x.entries_fetched ?? 0), 0) } : null,
    activity: (activity.data ?? []) as CaseViewData["activity"],
  };
}
