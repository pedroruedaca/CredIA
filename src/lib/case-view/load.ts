/** Loads everything the lender case view, exports and PDF show. Server-only; uses the lender's RLS client. */
import "server-only";
import { isLenderProvided } from "../cases/requirements.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCaseRegistry, type CaseRegistry } from "../borme/case.ts";
import type { BankKpiSet } from "../kpis/bank.ts";
import { adjustedGrossMarginKpi, normalizeCostDefinition, type CostOfSalesDefinition } from "../kpis/cost-of-sales.ts";
import type { Kpi } from "../kpis/engine.ts";
import type { CanonicalStatement } from "../pgc/mapping.ts";
import type { AnnualAccountsExtraction, CirbeExtraction, SolvencyReport } from "../schema/canonical.ts";
import type { CheckRow, SourceDoc } from "./present.ts";

const KPI_UNIT: Record<string, Kpi["unit"]> = {
  revenue: "EUR", ebitda: "EUR", workingCapital: "EUR", financialDebt: "EUR", netDebt: "EUR", ebitdaMargin: "%", dso: "days", dpo: "days",
  grossMargin: "%", netMargin: "%", roa: "%", roe: "%", dio: "days", ccc: "days",
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
  /** KPIs read from the bank movements (Norma 43), null without bank files. */
  bank: BankKpiSet | null;
  /** The analyst's cost of sales (adjusted gross margin), null when not defined. */
  costOfSales: { definition: CostOfSalesDefinition; source: "analyst" | "template"; updatedAt: string | null } | null;
  /** Names of the expense subaccounts in the ledger (trial balance / Holded), for the cost-of-sales editor and notes. */
  accountNames: Record<string, string>;
  checks: CheckRow[];
  reviews: Record<string, { status: "open" | "reviewed" | "clarification_requested"; note: string | null; at: string }>;
  documents: (SourceDoc & { status: string; uploaded_at: string; attention_message: string | null; summary: Record<string, unknown> | null })[];
  requirements: { doc_kind: string; required: boolean; max_age_days: number | null; source: "borrower" | "lender" }[];
  cirbe: CirbeExtraction | null;
  cirbeDocId: string | null;
  holded: { status: string; mode: string; lastSyncAt: string | null; entries: number } | null;
  activity: { action: string; actor: string; at: string; detail: Record<string, unknown> }[];
  /** Registry (BORME): candidates, the lender's confirmed match and its profile. */
  registry: CaseRegistry;
  /**
   * Latest informe de solvencia: the parsed report when there is one, else the latest upload's state so the
   * section can say it is being read or could not be read.
   */
  solvency: {
    docId: string;
    fileName: string;
    uploadedBy: "borrower" | "delegate" | "lender";
    status: string;
    attention: string | null;
    report: SolvencyReport | null;
  } | null;
  /** Latest cuentas anuales: parsed (fiscal year, model) or the latest upload's state. */
  annualAccounts: {
    docId: string;
    fileName: string;
    uploadedBy: "borrower" | "delegate" | "lender";
    status: string;
    attention: string | null;
    accounts: Pick<AnnualAccountsExtraction, "fiscalYear" | "model" | "periodEnd" | "pages"> & { hasPrior: boolean } | null;
  } | null;
  /** Company name as entered for the case (null when only the CIF is known). */
  registeredName: string | null;
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

  const [stmts, checks, reviews, docs, reqs, debt, holded, activity, registry, solvencyDocs, accountsDocs, bankKpis, costDef, ledgerNames] = await Promise.all([
    db.from("financial_statements").select("period_kind, statement, source, kpis(key, value, formula, inputs, note)").eq("case_id", caseId),
    db.from("checks").select("id, check_key, status, severity, message, evidence, source, document_id").eq("case_id", caseId).order("id"),
    db.from("check_reviews").select("check_key, status, note, at").eq("case_id", caseId).order("at", { ascending: false }),
    db
      .from("documents")
      .select("id, kind, status, original_filename, uploaded_at, issued_on, attention_message, extractions(summary, created_at)")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false }),
    db.from("case_requirements").select("doc_kind, required, max_age_days, source").eq("case_id", caseId),
    db.from("debt_positions").select("document_id, as_of, entity, product, drawn, limit_amount, overdue, maturity, source_ref").eq("case_id", caseId),
    db.from("holded_connections").select("status, mode, last_sync_at, created_at, holded_syncs(entries_fetched, created_at)").eq("case_id", caseId).order("created_at", { ascending: false }),
    db.from("audit_log").select("action, actor, at, detail").eq("case_id", caseId).order("at", { ascending: false }).limit(40),
    loadCaseRegistry(db, caseId, c.borrower_name),
    db
      .from("documents")
      .select("id, status, original_filename, uploaded_by, uploaded_at, attention_message, extractions(output, created_at)")
      .eq("case_id", caseId)
      .eq("kind", "solvency_report")
      .order("uploaded_at", { ascending: false })
      .limit(10),
    db
      .from("documents")
      .select("id, status, original_filename, uploaded_by, attention_message, extractions(output, created_at)")
      .eq("case_id", caseId)
      .eq("kind", "cuentas_anuales")
      .order("uploaded_at", { ascending: false })
      .limit(10),
    // On its own: before migration 0020 the column does not exist and the case view goes on without bank KPIs.
    db.from("cases").select("bank_kpis").eq("id", caseId).maybeSingle(),
    // Before migration 0021 the table does not exist: no definition, no adjusted margin.
    db.from("case_cost_definitions").select("preset, selectors, source, updated_at").eq("case_id", caseId).maybeSingle(),
    db.from("ledger_balances").select("account, account_name").eq("case_id", caseId).like("pgc3", "6%").not("account_name", "is", null).limit(2000),
  ]);

  type AccountsRow = { id: string; status: string; original_filename: string | null; uploaded_by: "borrower" | "delegate" | "lender"; attention_message: string | null; extractions: { output: { canonical?: { kind: string; data: AnnualAccountsExtraction } }; created_at: string }[] | null };
  const accountsRows = (accountsDocs.data ?? []) as unknown as AccountsRow[];
  const accountsOf = (r: AccountsRow) => {
    const latest = [...(r.extractions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const c = latest?.output?.canonical;
    return c?.kind === "annual_accounts" ? { fiscalYear: c.data.fiscalYear, model: c.data.model, periodEnd: c.data.periodEnd, pages: c.data.pages, hasPrior: c.data.prior !== null } : null;
  };
  const shownAccounts = accountsRows.find((r) => r.status === "parsed" && accountsOf(r)) ?? accountsRows[0] ?? null;

  type SolvencyRow = { id: string; status: string; original_filename: string | null; uploaded_by: "borrower" | "delegate" | "lender"; attention_message: string | null; extractions: { output: { canonical?: { kind: string; data: SolvencyReport } }; created_at: string }[] | null };
  const solvencyRows = (solvencyDocs.data ?? []) as unknown as SolvencyRow[];
  const reportOf = (r: SolvencyRow) => {
    const latest = [...(r.extractions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest?.output?.canonical?.kind === "solvency" ? latest.output.canonical.data : null;
  };
  // The newest parsed report wins; a newer upload still being read (or unreadable) is shown instead only if none parsed.
  const shown = solvencyRows.find((r) => r.status === "parsed" && reportOf(r)) ?? solvencyRows[0] ?? null;

  type StmtRow = { period_kind: "closed_fy" | "ytd"; statement: CanonicalStatement; source: string | null; kpis: { key: Kpi["key"]; value: number | null; formula: string; inputs: Record<string, number>; note: string | null }[] };
  const rows = (stmts.data ?? []) as StmtRow[];
  const pick = (k: StmtRow["period_kind"]) => rows.find((r) => r.period_kind === k) ?? null;
  const accountNames: Record<string, string> = {};
  for (const r of (ledgerNames.data ?? []) as { account: string; account_name: string }[]) accountNames[r.account] ??= r.account_name;
  const cd = costDef.data as { preset: string; selectors: unknown; source: "analyst" | "template"; updated_at: string } | null;
  const definition = cd ? normalizeCostDefinition({ preset: cd.preset, selectors: cd.selectors }) : null;
  const costOfSales = definition ? { definition, source: cd!.source, updatedAt: cd!.updated_at } : null;
  // Stored KPIs, plus the adjusted gross margin computed here from the statement and the analyst's definition (it
  // changes when the analyst saves, without reprocessing the case).
  const toKpis = (r: StmtRow | null): Kpi[] =>
    r
      ? [
          ...(r.kpis ?? []).map((k) => ({ key: k.key, value: k.value === null ? null : Number(k.value), unit: KPI_UNIT[k.key] ?? "x", formula: k.formula, inputs: k.inputs, note: k.note ?? undefined })),
          adjustedGrossMarginKpi(r.statement, costOfSales?.definition ?? null, costOfSales ? { source: costOfSales.source, at: costOfSales.updatedAt } : undefined, accountNames),
        ]
      : [];

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
    bank: ((bankKpis.data as { bank_kpis?: BankKpiSet | null } | null)?.bank_kpis ?? null),
    costOfSales,
    accountNames,
    checks: (checks.data ?? []) as CheckRow[],
    reviews: latestReview,
    documents: (docs.data ?? []).map(({ extractions, ...d }) => ({
      ...d,
      summary: [...((extractions as { summary: Record<string, unknown>; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.summary ?? null,
    })),
    requirements: (reqs.data ?? []).map((r) => ({ ...r, source: isLenderProvided(r.source) ? "lender" : "borrower" })),
    cirbe,
    cirbeDocId: debtRows[0]?.document_id ?? null,
    holded: h ? { status: h.status, mode: h.mode, lastSyncAt: h.last_sync_at, entries: syncs.reduce((s, x) => s + (x.entries_fetched ?? 0), 0) } : null,
    activity: (activity.data ?? []) as CaseViewData["activity"],
    registry,
    solvency: shown
      ? { docId: shown.id, fileName: shown.original_filename ?? "informe.pdf", uploadedBy: shown.uploaded_by, status: shown.status, attention: shown.attention_message, report: shown.status === "parsed" ? reportOf(shown) : null }
      : null,
    annualAccounts: shownAccounts
      ? {
          docId: shownAccounts.id,
          fileName: shownAccounts.original_filename ?? "cuentas-anuales.pdf",
          uploadedBy: shownAccounts.uploaded_by,
          status: shownAccounts.status,
          attention: shownAccounts.attention_message,
          accounts: shownAccounts.status === "parsed" ? accountsOf(shownAccounts) : null,
        }
      : null,
    registeredName: c.borrower_name,
  };
}
