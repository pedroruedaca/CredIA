/**
 * Processing pipeline for one case (server-only):
 *   1. process new documents: parse (trial balance, Norma 43) or extract with Claude (PDFs), verify, store
 *      an `extractions` row and set the document status the borrower sees;
 *   2. recompute everything derived, idempotently: ledger balances from uploads, bank transactions, debt
 *      positions, statements + KPIs per period (newest source wins), and engine checks.
 * One run per case at a time (cases.processing_lock_until); a request during a run schedules another pass.
 * Runs inline after uploads/syncs via next/server `after()`; behind this function so it can move to a queue.
 */
import "server-only";
import { WARNING_SEVERITY } from "../connectors/holded-sync.ts";
import { assessExtraction, type Canonical } from "../extract/assess.ts";
import { extractBankStatement, extractPdf, mapTrialBalanceColumns, STATEMENT_MAX_PAGES } from "../extract/claude.ts";
import { modelFor } from "../llm/model.ts";
import type { ExtractKind } from "../extract/schemas.ts";
import { classifyAccounts } from "../bank/classify.ts";
import { computeBankKpis } from "../kpis/bank.ts";
import { computeKpis } from "../kpis/engine.ts";
import { getDocumentProxy } from "unpdf";
import { statementFromPdf } from "../bank/pdf-statement.ts";
import { parseBankSheets } from "../parsers/bank-sheet.ts";
import { parseNorma43, type N43Account } from "../parsers/norma43.ts";
import { readSpreadsheet, decodeText } from "../parsers/spreadsheet.ts";
import { parseTrialBalance, type TrialBalanceParse } from "../parsers/trial-balance.ts";
import { annualAccountsPeriod, statementFromAnnualAccounts } from "../pgc/annual-accounts.ts";
import { buildStatement, isFullStatement } from "../pgc/mapping.ts";
import { MODELO200_SOURCE, MODELO303_SOURCE, modelo200Period, statementFromModelo200, statementFromModelo303 } from "../pgc/tax-returns.ts";
import { coveredYtdEnd, type M303Return } from "../tax/modelo303.ts";
import { analystCompletesCase } from "../cases/attention.ts";
import type { AnnualAccountsExtraction, CertificateExtraction, CirbeExtraction, Modelo200Extraction, SolvencyReport } from "../schema/canonical.ts";
import type { AdminClient } from "../borrower/access.ts";
import { addDays, fiscalYearStart, type LedgerBalance, type Period, type PeriodKind, type Warning } from "../types.ts";
import { todayMadrid } from "../format.ts";
import {
  checkCertificate,
  checkCirbeVsBooks,
  checkDebtPaymentsVsDeclaredDebt,
  checkFinancingInflows,
  checkModelo200VsBooks,
  checkModelo303Quarters,
  checkModelo303VsBooks,
  checkN43InflowsVsRevenue,
  checkOverdrafts,
  checkSolvencyReport,
  cirbeAnnualPrincipal,
  type CheckResult,
  type Severity,
} from "../checks/engine.ts";
import { assignTbPeriods, chooseSource, dedupeBankAccounts } from "./plan.ts";
import { caseBormeChecks } from "../borme/case.ts";

const LOCK_MS = 10 * 60 * 1000;
const STALE_PARSING_MS = 15 * 60 * 1000;
const MAX_PASSES = 3;

/** Severity of parser/extraction warnings when they become checks. Unknown codes are "info". */
export const PIPELINE_WARNING_SEVERITY: Record<string, Severity> = {
  ...WARNING_SEVERITY,
  tb_unbalanced: "high",
  tb_no_pnl_accounts: "warn",
  tb_period_assumed: "warn",
  n43_totals_mismatch: "warn",
  n43_balance_mismatch: "warn",
  n43_malformed_lines: "warn",
  n43_non_eur: "warn",
  ca_total_assets_mismatch: "warn",
  ca_total_liabilities_mismatch: "warn",
  ca_pre_tax_mismatch: "warn",
  ca_lines_exceed_total: "warn",
  ca_operating_lines_unreconciled: "warn",
  ca_incomplete: "warn",
  m200_total_assets_mismatch: "warn",
  m200_total_liabilities_mismatch: "warn",
  m200_pre_tax_mismatch: "warn",
  m200_lines_exceed_total: "warn",
  m200_operating_lines_unreconciled: "warn",
};
/** Where a statement comes from, as the 303 comparison names it. */
const BOOKS_LABEL: Record<string, string> = { upload: "la contabilidad", holded: "la contabilidad", annual_accounts: "las cuentas anuales", modelo200: "el Modelo 200" };

/** Warnings already covered by a dedicated check. */
const SKIP_AS_CHECK = new Set(["cert_negative"]);

interface CaseRow {
  id: string;
  lender_id: string;
  borrower_cif: string;
  borrower_name: string | null;
  fiscal_year_end: string | null;
  status: string;
  submitted_at: string | null;
  lenders: { name: string } | null;
}

interface DocRow {
  id: string;
  kind: string;
  status: string;
  storage_path: string;
  original_filename: string | null;
  uploaded_at: string;
  processing_started_at: string | null;
}

type Outcome = {
  status: "parsed" | "failed" | "needs_review" | "uploaded";
  attention?: string | null;
  issuedOn?: string | null;
  extraction?: { parser: string; status: "parsed" | "failed" | "needs_review" | "pending"; output: unknown; warnings: Warning[]; summary?: Record<string, unknown> };
};

// ---------------------------------------------------------------------------------------------------------------
// Entry point

export async function processCase(db: AdminClient, caseId: string, now = () => new Date()): Promise<{ ran: boolean }> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const lockUntil = new Date(now().getTime() + LOCK_MS).toISOString();
    const { data: locked } = await db
      .from("cases")
      .update({ processing_lock_until: lockUntil, processing_requested: false })
      .eq("id", caseId)
      .or(`processing_lock_until.is.null,processing_lock_until.lt."${now().toISOString()}"`) // quoted: ISO has "."
      .select("id");
    if (!locked?.length) {
      if (pass === 0) await db.from("cases").update({ processing_requested: true }).eq("id", caseId);
      return { ran: pass > 0 };
    }
    try {
      const kase = await loadCase(db, caseId);
      if (!kase) return { ran: false };
      await processDocuments(db, kase, now);
      await recompute(db, kase, now());
    } catch (e) {
      console.error("[pipeline] case run failed:", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
    } finally {
      const { data: released } = await db.from("cases").update({ processing_lock_until: null }).eq("id", caseId).select("processing_requested");
      if (!released?.[0]?.processing_requested) return { ran: true };
    }
  }
  return { ran: true };
}

async function loadCase(db: AdminClient, caseId: string): Promise<CaseRow | null> {
  const { data } = await db
    .from("cases")
    .select("id, lender_id, borrower_cif, borrower_name, fiscal_year_end, status, submitted_at, lenders(name)")
    .eq("id", caseId)
    .maybeSingle();
  return (data as unknown as CaseRow) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Documents

async function processDocuments(db: AdminClient, kase: CaseRow, now: () => Date) {
  const { data: docs } = await db
    .from("documents")
    .select("id, kind, status, storage_path, original_filename, uploaded_at, processing_started_at")
    .eq("case_id", kase.id)
    .in("status", ["uploaded", "parsing"])
    .order("uploaded_at", { ascending: true });
  if (!docs?.length) return;

  // A PDF bank statement recorded as pending before statements were read (n43:pdf@0) still has to be read.
  const { data: done } = await db.from("extractions").select("document_id, parser").in("document_id", docs.map((d) => d.id));
  const hasExtraction = new Set((done ?? []).filter((e) => e.parser !== "n43:pdf@0").map((e) => e.document_id));
  const staleBefore = new Date(now().getTime() - STALE_PARSING_MS).toISOString();
  const pending = (docs as DocRow[]).filter((d) =>
    d.status === "uploaded" ? !hasExtraction.has(d.id) : !d.processing_started_at || d.processing_started_at < staleBefore,
  );

  for (const doc of pending) {
    let claim = db.from("documents").update({ status: "parsing", processing_started_at: now().toISOString() }).eq("id", doc.id).eq("status", doc.status);
    if (doc.status === "parsing" && doc.processing_started_at) claim = claim.eq("processing_started_at", doc.processing_started_at);
    const { data: claimed } = await claim.select("id");
    if (!claimed?.length) continue;
    await db.from("cases").update({ processing_lock_until: new Date(now().getTime() + LOCK_MS).toISOString() }).eq("id", kase.id);

    let outcome: Outcome;
    try {
      outcome = await processOne(db, kase, doc);
    } catch (e) {
      console.error("[pipeline] document failed:", doc.kind, (e as Error)?.name);
      outcome = { status: "uploaded" }; // retried on the next run
    }
    if (outcome.extraction) {
      await db.from("extractions").insert({
        document_id: doc.id,
        lender_id: kase.lender_id,
        parser: outcome.extraction.parser,
        status: outcome.extraction.status,
        output: outcome.extraction.output as object,
        warnings: outcome.extraction.warnings,
        summary: outcome.extraction.summary ?? {},
      });
    }
    const update: Record<string, unknown> = { status: outcome.status, attention_message: outcome.attention ?? null, processing_started_at: null };
    if (outcome.issuedOn) update.issued_on = outcome.issuedOn;
    await db.from("documents").update(update).eq("id", doc.id);
  }
}

const statementSummary = (accounts: N43Account[]) => {
  const starts = accounts.map((a) => a.start).filter(Boolean).sort();
  const ends = accounts.map((a) => a.end).filter(Boolean).sort();
  return { period: { start: starts[0] ?? null, end: ends[ends.length - 1] ?? null }, accounts: accounts.length };
};

/** Bank movements exported as Excel or CSV: deterministic, used only if they add up. */
async function readSheetStatement(bytes: Uint8Array, ext: string, doc: DocRow, name: string): Promise<Outcome> {
  let sheets;
  try {
    sheets = await readSpreadsheet(bytes, ext);
  } catch {
    return { status: "failed", attention: `No hemos podido abrir «${name}». Comprueba que se abre en Excel y vuelve a descargarlo.`, extraction: { parser: "bank:sheet@1", status: "failed", output: {}, warnings: [] } };
  }
  const r = parseBankSheets(sheets, { docId: doc.id, fileName: name });
  if (!r.data) {
    return {
      status: "failed",
      attention: `No reconocemos los movimientos de «${name}». Descarga los movimientos de la cuenta con sus columnas de fecha, concepto e importe (o cargo y abono), y saldo; o mejor, el fichero Norma 43.`,
      extraction: { parser: "bank:sheet@1", status: "failed", output: {}, warnings: r.warnings },
    };
  }
  const status = r.data.needsReview ? "needs_review" : "parsed";
  return {
    status,
    attention: r.data.needsReview ? `Los movimientos de «${name}» no cuadran con sus saldos, así que no los usamos. Comprueba que el fichero tenga todos los movimientos del periodo, sin filtros.` : null,
    extraction: { parser: "bank:sheet@1", status, output: { accounts: r.data.accounts }, warnings: r.warnings, summary: statementSummary(r.data.accounts) },
  };
}

/** A PDF bank statement, read by Claude a few pages at a time and used only if it adds up. */
async function readPdfStatement(bytes: Uint8Array, kase: CaseRow, doc: DocRow, name: string): Promise<Outcome> {
  let pages = 0;
  try {
    pages = (await getDocumentProxy(new Uint8Array(bytes))).numPages;
  } catch {
    return { status: "failed", attention: `No hemos podido abrir «${name}». Descarga de nuevo el extracto en PDF o sube el fichero Norma 43.`, extraction: { parser: "bank:pdf@1", status: "failed", output: {}, warnings: [] } };
  }
  if (pages > STATEMENT_MAX_PAGES) {
    return {
      status: "needs_review",
      attention: `«${name}» tiene ${pages} páginas, demasiadas para leerlo de una vez. Sube los extractos por trimestres o, mejor, el fichero Norma 43.`,
      extraction: { parser: "bank:pdf@1", status: "needs_review", output: { pages }, warnings: [] },
    };
  }
  const call = await extractBankStatement(bytes, pages);
  if (!call.ok) {
    if (call.reason === "api_error" || call.reason === "not_configured") {
      console.error("[pipeline] bank statement PDF not read:", call.reason === "not_configured" ? "ANTHROPIC_API_KEY is not set" : `Claude API error (${call.detail ?? "no detail"})`);
      return { status: "uploaded" };
    }
    return { status: "needs_review", attention: null, extraction: { parser: "bank:pdf@1", status: "needs_review", output: { reason: call.reason }, warnings: [{ code: `extract_${call.reason}`, message: call.detail ?? call.reason }] } };
  }
  const r = statementFromPdf(call.value, { docId: doc.id, fileName: name, caseCif: kase.borrower_cif, companyName: kase.borrower_name ?? kase.borrower_cif });
  return {
    status: r.status,
    attention: r.attention,
    extraction: { parser: `bank:pdf@1:${call.model}`, status: r.status, output: { accounts: r.accounts, pages }, warnings: r.warnings, summary: statementSummary(r.accounts) },
  };
}

const extOf = (path: string) => (/\.([a-z0-9]{1,5})$/i.exec(path)?.[1] ?? "").toLowerCase();

async function processOne(db: AdminClient, kase: CaseRow, doc: DocRow): Promise<Outcome> {
  const { data: blob, error } = await db.storage.from("case-files").download(doc.storage_path);
  if (error || !blob) {
    console.error("[pipeline] storage download failed:", doc.kind, error?.message?.slice(0, 200));
    return { status: "uploaded" };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ext = extOf(doc.storage_path);
  const name = doc.original_filename ?? "el documento";
  const failed = (parser: string, attention: string, warnings: Warning[] = []): Outcome => ({
    status: "failed",
    attention,
    extraction: { parser, status: "failed", output: {}, warnings },
  });

  if (doc.kind === "trial_balance") {
    let sheets;
    try {
      sheets = await readSpreadsheet(bytes, ext);
    } catch {
      return failed("tb@1", `No hemos podido abrir «${name}». Comprueba que se abre en Excel y vuelve a exportarlo.`);
    }
    let parsed = parseTrialBalance(sheets, { docId: doc.id, fileName: name });
    let mappingSource = "detected";
    if (!parsed.data) {
      const m = await mapTrialBalanceColumns(sheets);
      if (m.ok) {
        parsed = parseTrialBalance(sheets, { docId: doc.id, fileName: name, mapping: m.value });
        mappingSource = `llm:${m.model}`;
      } else if (m.reason === "api_error") return { status: "uploaded" };
    }
    if (!parsed.data) {
      return failed("tb@1", `No reconocemos las columnas de «${name}». Exporta el balance de sumas y saldos a nivel de subcuenta, con columnas de cuenta y de debe/haber o saldo.`, parsed.warnings);
    }
    if (parsed.data.balances.length === 0) return failed(`tb:${parsed.data.template}@1`, `«${name}» no contiene saldos de cuentas. Exporta el balance de sumas y saldos completo.`, parsed.warnings);
    return {
      status: "parsed",
      extraction: {
        parser: `tb:${parsed.data.template}@1`,
        status: "parsed",
        output: { ...parsed.data, mappingSource },
        warnings: parsed.warnings,
        summary: { period: parsed.data.period, accounts: parsed.data.balances.length },
      },
    };
  }

  if (doc.kind === "norma43") {
    // Norma 43 first (exact, self-checking); Excel/CSV exports and PDF statements are read into the same accounts and
    // used only if they add up (src/lib/bank/statement.ts).
    if (ext === "pdf") return readPdfStatement(bytes, kase, doc, name);
    if (ext === "xls") return failed("bank:sheet@1", `«${name}» está en el formato antiguo de Excel (.xls). Ábrelo y guárdalo como .xlsx o .csv, o descarga el Norma 43 de la banca online.`);
    if (ext === "xlsx" || ext === "csv") return readSheetStatement(bytes, ext, doc, name);
    const r = parseNorma43(decodeText(bytes), { docId: doc.id });
    if (r.data.length === 0) {
      // A .txt can also be a delimited export.
      if (ext === "txt") {
        const sheet = await readSheetStatement(bytes, "csv", doc, name);
        if (sheet.status !== "failed") return sheet;
      }
      return failed("n43@1", `«${name}» no es un fichero Norma 43. Descárgalo de la banca online eligiendo el formato Norma 43 / Cuaderno 43, o sube los movimientos en Excel, CSV o PDF.`, r.warnings);
    }
    const starts = r.data.map((a) => a.start).sort();
    const ends = r.data.map((a) => a.end).sort();
    return {
      status: "parsed",
      extraction: {
        parser: "n43@1",
        status: "parsed",
        output: { accounts: r.data },
        warnings: r.warnings,
        summary: { period: { start: starts[0], end: ends[ends.length - 1] }, accounts: r.data.length },
      },
    };
  }

  const kind = doc.kind as ExtractKind;
  if (!["modelo200", "modelo303", "cuentas_anuales", "cirbe", "aeat_cert", "tgss_cert", "solvency_report"].includes(kind)) return { status: "uploaded" };
  const call = await extractPdf(kind, bytes);
  if (!call.ok) {
    if (call.reason === "api_error" || call.reason === "not_configured") {
      // Left as "uploaded" to be retried; say why in the logs (never the key or the document).
      console.error(
        "[pipeline] PDF not read:",
        doc.kind,
        call.reason === "not_configured" ? "ANTHROPIC_API_KEY is not set" : `Claude API error (${call.detail ?? "no detail"}, model ${modelFor("extraction")})`,
      );
      return { status: "uploaded" };
    }
    return {
      status: "needs_review",
      attention: null,
      extraction: { parser: `llm:${kind}@1`, status: "needs_review", output: { reason: call.reason }, warnings: [{ code: `extract_${call.reason}`, message: call.detail ?? call.reason }] },
    };
  }
  const closedStartYear = kase.fiscal_year_end ? Number(kase.fiscal_year_end.slice(0, 4)) - (kase.fiscal_year_end.slice(5) === "12-31" ? 0 : 1) : null;
  const a = assessExtraction(kind, call.value as Parameters<typeof assessExtraction>[1], {
    fileName: name,
    caseCif: kase.borrower_cif,
    companyName: kase.borrower_name ?? kase.borrower_cif,
    lenderName: kase.lenders?.name ?? "la entidad",
    expectedFiscalYear: closedStartYear,
  });
  return {
    status: a.status,
    attention: a.attentionMessage,
    issuedOn: a.issuedOn,
    extraction: {
      parser: `llm:${kind}@1`,
      status: a.status,
      output: { model: call.model, wire: call.value, canonical: a.canonical },
      warnings: a.warnings,
      summary:
        a.canonical?.kind === "annual_accounts"
          ? { fiscal_year: a.canonical.data.fiscalYear, model: a.canonical.data.model, prior_year: a.canonical.data.prior !== null }
          : a.canonical?.kind === "modelo303"
            ? { period: { start: a.canonical.data.periodStart, end: a.canonical.data.periodEnd } }
            : undefined,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Recompute derived data

interface ParsedDoc {
  id: string;
  kind: string;
  fileName: string;
  uploadedAt: string;
  output: Record<string, unknown>;
  warnings: Warning[];
}

async function insertChunks(db: AdminClient, table: string, rows: object[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

/** Warning detail as check evidence: scalar values stay, a detail source_ref (account row, ledger) becomes the source. */
function warningEvidence(w: Warning, documentId: string | null): CheckResult["evidence"] {
  const values: Record<string, number | string | null> = {};
  const sources: string[] = [];
  for (const [k, v] of Object.entries(w.detail ?? {})) {
    if (k === "source_ref" && typeof v === "string") sources.push(v);
    else if (v === null || typeof v === "number" || typeof v === "string") values[k] = v;
  }
  if (sources.length === 0 && documentId) sources.push(`doc:${documentId}`);
  return { values, sources };
}

async function recompute(db: AdminClient, kase: CaseRow, now: Date) {
  const today = todayMadrid(now);
  const checks: (CheckResult & { documentId?: string | null })[] = [];
  const addWarnings = (ws: Warning[], documentId: string | null, prefix = "") => {
    for (const w of ws) {
      if (SKIP_AS_CHECK.has(w.code)) continue;
      checks.push({
        key: w.code,
        status: "fail",
        severity: PIPELINE_WARNING_SEVERITY[w.code] ?? "info",
        message: `${prefix}${w.message}`,
        evidence: warningEvidence(w, documentId),
        documentId,
      });
    }
  };

  // Parsed documents with their latest extraction.
  const { data: rows } = await db
    .from("documents")
    .select("id, kind, original_filename, uploaded_at, extractions(output, warnings, created_at)")
    .eq("case_id", kase.id)
    .eq("status", "parsed");
  const parsed: ParsedDoc[] = (rows ?? []).flatMap((d) => {
    const ex = [...((d.extractions as { output: Record<string, unknown>; warnings: Warning[]; created_at: string }[]) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return ex ? [{ id: d.id, kind: d.kind, fileName: d.original_filename ?? "documento", uploadedAt: d.uploaded_at, output: ex.output, warnings: ex.warnings ?? [] }] : [];
  });
  for (const d of parsed) addWarnings(d.warnings, d.id, `«${d.fileName}»: `);
  const latest = (kind: string) => parsed.filter((d) => d.kind === kind).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0] ?? null;

  // PDF bank statements recorded as pending before they were read (re-read on this run; the notice covers the gap).
  const { data: pendingPdf } = await db.from("documents").select("id, original_filename, extractions(parser)").eq("case_id", kase.id).eq("kind", "norma43").eq("status", "uploaded");
  for (const d of pendingPdf ?? []) {
    if ((d.extractions as { parser: string }[] | null)?.some((e) => e.parser === "n43:pdf@0")) {
      addWarnings([{ code: "n43_pdf_pending", message: `Extracto en PDF «${d.original_filename ?? "documento"}» recibido; aún no se lee automáticamente.` }], d.id);
    }
  }

  // --- Trial balances from uploads → ledger_balances (source upload)
  const uploadBalances = new Map<PeriodKind, { period: Period; balances: LedgerBalance[]; at: string; docId: string }>();
  await db.from("ledger_balances").delete().eq("case_id", kase.id).eq("source", "upload");
  if (kase.fiscal_year_end) {
    const tbs = parsed.filter((d) => d.kind === "trial_balance");
    const assignments = assignTbPeriods(
      tbs.map((d) => ({ docId: d.id, uploadedAt: d.uploadedAt, fileName: d.fileName, detected: (d.output as unknown as TrialBalanceParse).period })),
      kase.fiscal_year_end,
      today,
    );
    for (const a of assignments) {
      addWarnings(a.warnings, a.docId);
      if (!a.period) continue;
      const d = tbs.find((t) => t.id === a.docId)!;
      uploadBalances.set(a.period.kind, { period: a.period, balances: (d.output as unknown as TrialBalanceParse).balances, at: d.uploadedAt, docId: d.id });
    }
    await insertChunks(
      db,
      "ledger_balances",
      [...uploadBalances.values()].flatMap((u) =>
        u.balances.map((b) => ({
          case_id: kase.id, lender_id: kase.lender_id, document_id: u.docId, period_kind: u.period.kind,
          period_start: u.period.start, period_end: u.period.end, account: b.account, pgc3: b.pgc3, account_name: b.name ?? null,
          debit: b.debit, credit: b.credit, source: "upload", source_ref: b.sourceRef,
        })),
      ),
    );
  } else if (parsed.some((d) => d.kind === "trial_balance")) {
    addWarnings([{ code: "tb_no_fiscal_year_end", message: "El caso no tiene fecha de cierre del ejercicio: no se pueden asignar periodos a los balances." }], null);
  }

  // --- Holded balances (written by the Holded route) and when each period was synced
  const { data: holdedRows } = await db
    .from("ledger_balances")
    .select("period_kind, period_start, period_end, account, pgc3, account_name, debit, credit, source_ref")
    .eq("case_id", kase.id)
    .eq("source", "holded");
  const { data: conns } = await db.from("holded_connections").select("id").eq("case_id", kase.id);
  const { data: syncs } = conns?.length
    ? await db.from("holded_syncs").select("period_kind, created_at").in("connection_id", conns.map((c) => c.id))
    : { data: [] as { period_kind: string; created_at: string }[] };
  const holdedAt = (kind: PeriodKind) => (syncs ?? []).filter((s) => s.period_kind === kind).map((s) => s.created_at).sort().at(-1) ?? null;

  // --- Bank transactions (Norma 43)
  const bank = dedupeBankAccounts(parsed.filter((d) => d.kind === "norma43").map((d) => ({ docId: d.id, uploadedAt: d.uploadedAt, accounts: (d.output.accounts as N43Account[]) ?? [] })));
  // Classified again over all the case's files: rule changes reach files parsed before, and transfers between
  // accounts in different files are found.
  classifyAccounts(bank.map((b) => b.account), { companyName: kase.borrower_name });
  await db.from("bank_transactions").delete().eq("case_id", kase.id);
  await insertChunks(
    db,
    "bank_transactions",
    bank.flatMap(({ docId, account }) =>
      account.transactions.map((t) => ({
        case_id: kase.id, lender_id: kase.lender_id, document_id: docId, iban_masked: account.accountMasked,
        booking_date: t.bookingDate, value_date: t.valueDate, amount: t.amount, concept_code: `${t.commonConcept}/${t.ownConcept}`,
        description: t.description || null, category: t.category, counterparty: null, source_ref: t.sourceRef,
      })),
    ),
  );
  const accounts = bank.map((b) => b.account);
  // Bank KPIs (balances and cash flows from the movements). Written on their own: a database without migration 0020
  // only loses them.
  const bankKpis = computeBankKpis(bank.map(({ docId, account }) => ({ ...account, docId })));
  const { error: bankKpisError } = await db.from("cases").update({ bank_kpis: bankKpis }).eq("id", kase.id);
  if (bankKpisError) console.error("[pipeline] bank KPIs not saved:", bankKpisError.message?.slice(0, 200));

  // --- CIRBE → debt_positions
  const cirbeDoc = latest("cirbe");
  const cirbe = (cirbeDoc?.output.canonical as Canonical | undefined)?.kind === "cirbe" ? ((cirbeDoc!.output.canonical as { data: CirbeExtraction }).data) : null;
  await db.from("debt_positions").delete().eq("case_id", kase.id);
  if (cirbe && cirbeDoc) {
    await insertChunks(
      db,
      "debt_positions",
      cirbe.positions.map((p) => ({
        case_id: kase.id, lender_id: kase.lender_id, document_id: cirbeDoc.id, as_of: cirbe.asOf, entity: p.entity, product: p.product,
        drawn: p.drawn, limit_amount: p.limit, overdue: p.overdue, maturity: p.maturity, source_ref: `doc:${cirbeDoc.id}:page:${p.page}`,
      })),
    );
  }
  const annualPrincipal = cirbe ? cirbeAnnualPrincipal(cirbe) : undefined;

  // --- Statements + KPIs, per period. Ledger data first (newest of trial balance and Holded wins). Without it, the
  // closed year falls back to the deposited annual accounts, then the Modelo 200 (same model), then the sales declared
  // in the Modelo 303 (revenue only); the year to date falls back to the Modelo 303.
  await db.from("financial_statements").delete().eq("case_id", kase.id);
  const statements: Partial<Record<PeriodKind, ReturnType<typeof buildStatement>["data"]>> = {};
  const sources: Partial<Record<PeriodKind, string>> = {};
  const caDoc = latest("cuentas_anuales");
  const annual = (caDoc?.output.canonical as Canonical | undefined)?.kind === "annual_accounts" ? (caDoc!.output.canonical as { data: AnnualAccountsExtraction }).data : null;
  const m200Doc = latest("modelo200");
  const m200 = (m200Doc?.output.canonical as Canonical | undefined)?.kind === "accounts" ? (m200Doc!.output.canonical as { data: Modelo200Extraction }).data : null;
  const m303: M303Return[] = parsed.flatMap((d) => {
    const c = d.output.canonical as Canonical | undefined;
    return d.kind === "modelo303" && c?.kind === "modelo303" ? [{ docId: d.id, uploadedAt: d.uploadedAt, data: c.data }] : [];
  });
  const fyStart = kase.fiscal_year_end ? addDays(kase.fiscal_year_end, 1) : null;
  for (const kind of ["closed_fy", "ytd"] as PeriodKind[]) {
    const up = uploadBalances.get(kind) ?? null;
    const hRows = (holdedRows ?? []).filter((r) => r.period_kind === kind);
    const ledger = chooseSource(up?.at ?? null, hRows.length ? holdedAt(kind) ?? "0" : null);
    let built: { data: ReturnType<typeof buildStatement>["data"]; warnings: Warning[] } | null = null;
    let source: string | null = ledger;
    if (ledger) {
      const period: Period = ledger === "upload" ? up!.period : { kind, start: hRows[0].period_start, end: hRows[0].period_end };
      const balances: LedgerBalance[] =
        ledger === "upload"
          ? up!.balances
          : hRows.map((r) => ({ account: r.account, pgc3: r.pgc3, name: r.account_name ?? undefined, debit: Number(r.debit), credit: Number(r.credit), source: "holded", sourceRef: r.source_ref }));
      built = buildStatement(balances, period);
    } else if (kind === "closed_fy") {
      const caPeriod = annual ? annualAccountsPeriod(annual, kase.fiscal_year_end) : null;
      const m200Period = m200 ? modelo200Period(m200, kase.fiscal_year_end) : null;
      const closedPeriod: Period | null = kase.fiscal_year_end ? { kind, start: fiscalYearStart(kase.fiscal_year_end), end: kase.fiscal_year_end } : null;
      const fromM303 = closedPeriod ? statementFromModelo303(m303, closedPeriod) : null;
      if (caPeriod) [built, source] = [statementFromAnnualAccounts(annual!, caDoc!.id, caPeriod), "annual_accounts"];
      else if (m200Period) [built, source] = [statementFromModelo200(m200!, m200Doc!.id, m200Period), MODELO200_SOURCE];
      else if (fromM303) [built, source] = [{ data: fromM303, warnings: [] }, MODELO303_SOURCE];
    } else if (fyStart) {
      // Never past the end of the current fiscal year (a stale closing date would otherwise stretch it).
      const fyEnd = `${Number(kase.fiscal_year_end!.slice(0, 4)) + 1}${kase.fiscal_year_end!.slice(4)}`;
      const covered = coveredYtdEnd(m303, fyStart);
      const end = covered && covered > fyEnd ? fyEnd : covered;
      const fromM303 = end ? statementFromModelo303(m303, { kind, start: fyStart, end }) : null;
      if (fromM303) [built, source] = [{ data: fromM303, warnings: [] }, MODELO303_SOURCE];
    }
    if (!built || !source) continue;
    const { data: statement, warnings } = built;
    const period = statement.period;
    statements[kind] = statement;
    sources[kind] = source;
    addWarnings(warnings, null, `[${kind === "closed_fy" ? "Ejercicio cerrado" : "Año en curso"}] `);
    const kpis = computeKpis(statement, annualPrincipal !== undefined ? { annualPrincipal, annualPrincipalSource: `CIRBE ${cirbe!.asOf}` } : {});
    const { data: stmt, error } = await db
      .from("financial_statements")
      .insert({ case_id: kase.id, lender_id: kase.lender_id, period_kind: kind, period_start: period.start, period_end: period.end, statement, source })
      .select("id")
      .single();
    if (error || !stmt) throw new Error(`insert statement: ${error?.message}`);
    await insertChunks(db, "kpis", kpis.map((k) => ({ statement_id: stmt.id, lender_id: kase.lender_id, key: k.key, value: k.value, formula: k.formula, inputs: k.inputs, note: k.note ?? null })));
  }

  // --- Engine checks. Checks that need the balance sheet or the full P&L skip revenue-only (Modelo 303) statements.
  const closed = statements.closed_fy ?? null;
  const ytd = statements.ytd ?? null;
  const full = [closed, ytd].filter(isFullStatement);
  if (cirbe && cirbeDoc) {
    const nearest = [...full].sort((a, b) => Math.abs(Date.parse(a.period.end) - Date.parse(cirbe.asOf)) - Math.abs(Date.parse(b.period.end) - Date.parse(cirbe.asOf)))[0];
    if (nearest) checks.push(...checkCirbeVsBooks(nearest, cirbe, cirbeDoc.id));
  }
  // Not when the closed year was built from the Modelo 200 itself.
  if (isFullStatement(closed) && m200 && m200Doc && sources.closed_fy !== MODELO200_SOURCE) checks.push(...checkModelo200VsBooks(closed, m200, m200Doc.id));
  if (accounts.length) {
    const flows = [ytd, closed].filter(Boolean).map((s) => checkN43InflowsVsRevenue(s!, accounts)).find((c) => c.status !== "not_applicable");
    if (flows) checks.push(flows);
    const debtBasis = isFullStatement(ytd) ? ytd : isFullStatement(closed) ? closed : null;
    checks.push(checkOverdrafts(accounts), checkDebtPaymentsVsDeclaredDebt(accounts, debtBasis, cirbe), checkFinancingInflows(accounts, debtBasis, cirbe));
  }
  const { data: reqs } = await db.from("case_requirements").select("doc_kind, required, max_age_days, source").eq("case_id", kase.id);
  for (const kind of ["aeat_cert", "tgss_cert"] as const) {
    const req = (reqs ?? []).find((r) => r.doc_kind === kind);
    if (!req) continue;
    const doc = latest(kind);
    const cert = (doc?.output.canonical as Canonical | undefined)?.kind === "certificate" ? (doc!.output.canonical as { data: CertificateExtraction }).data : null;
    checks.push(checkCertificate(kind, cert, doc?.id ?? null, req.max_age_days, today));
  }

  // Modelo 303: last 4 quarters filed, and declared sales vs the revenue of each period they cover (not a period
  // built from the 303 itself).
  checks.push(checkModelo303Quarters(m303, today));
  for (const kind of ["closed_fy", "ytd"] as PeriodKind[]) {
    const s = statements[kind];
    if (!s || sources[kind] === MODELO303_SOURCE) continue;
    checks.push(checkModelo303VsBooks(s, m303, BOOKS_LABEL[sources[kind]!] ?? "la contabilidad"));
  }

  // Informe de solvencia (latest report, uploaded by the company or the lender).
  const solvencyDoc = latest("solvency_report");
  const solvency = (solvencyDoc?.output.canonical as Canonical | undefined)?.kind === "solvency" ? (solvencyDoc!.output.canonical as { data: SolvencyReport }).data : null;
  if (solvency && solvencyDoc) checks.push(...checkSolvencyReport(solvency, solvencyDoc.id, closed));

  // Registry (BORME), once the lender has confirmed which registry sheet is the company.
  checks.push(...(await caseBormeChecks(db, kase.id, today)));

  await db.from("checks").delete().eq("case_id", kase.id).eq("source", "engine");
  await insertChunks(
    db,
    "checks",
    checks
      .filter((c) => c.status !== "not_applicable")
      .map((c) => ({
        case_id: kase.id, lender_id: kase.lender_id, check_key: c.key, status: c.status, severity: c.severity, message: c.message,
        evidence: c.evidence, source: "engine", document_id: c.documentId ?? null,
      })),
  );

  // --- Case status: submitted cases become ready (or needs_review) once nothing is left to process.
  // Still to process: parsing, or uploaded with no extraction yet (e.g. waiting for the API). PDF bank statements
  // are recorded as pending on purpose and don't hold the case back.
  const { data: open } = await db.from("documents").select("status, extractions(id)").eq("case_id", kase.id).in("status", ["parsing", "uploaded", "needs_review"]);
  const waiting = (open ?? []).some((d) => d.status === "parsing" || (d.status === "uploaded" && !(d.extractions as unknown[] | null)?.length));
  const update: Record<string, unknown> = { processed_at: now.toISOString() };
  // Nothing for the company to provide ("Lo subo yo" for every document): the case moves on, as if submitted, once the
  // analyst's required documents are in.
  let status = kase.status;
  if (!kase.submitted_at && status === "awaiting_documents") {
    const { data: docKinds } = await db.from("documents").select("kind, status").eq("case_id", kase.id);
    if (analystCompletesCase(reqs ?? [], docKinds ?? [])) {
      update.submitted_at = now.toISOString();
      status = "processing";
      await db.from("audit_log").insert({ lender_id: kase.lender_id, case_id: kase.id, actor: "system", action: "case.analyst_documents_complete", detail: {} });
    }
  }
  if ((kase.submitted_at || update.submitted_at) && ["processing", "ready", "needs_review"].includes(status)) {
    update.status = (open ?? []).some((d) => d.status === "needs_review") ? "needs_review" : waiting ? "processing" : "ready";
  }
  await db.from("cases").update(update).eq("id", kase.id);
  await db.from("audit_log").insert({
    lender_id: kase.lender_id,
    case_id: kase.id,
    actor: "system",
    action: "pipeline.recomputed",
    detail: { statements: Object.keys(statements), checks: checks.filter((c) => c.status !== "not_applicable").length, documents_parsed: parsed.length },
  });
}
