/**
 * Turns a Claude extraction into (a) a decision about the uploaded document and (b) the canonical, Zod-validated
 * data. Pure. A wrong document type, another company's CIF, a wrong fiscal year or an unreadable scan fails the
 * document with a borrower-facing fix message; the checklist shows it and the borrower re-uploads.
 */
import { DOC_TYPE_LABEL } from "../../content/extraction.es.ts";
import { isValidCif, normalizeCif } from "../cif.ts";
import {
  AnnualAccountsExtractionSchema,
  type AnnualAccountsExtraction,
  CertificateExtractionSchema,
  CirbeExtractionSchema,
  Modelo200ExtractionSchema,
  SolvencyReportSchema,
  type SolvencyReport,
  type CertificateExtraction,
  type CirbeExtraction,
  type Modelo200Extraction,
} from "../schema/canonical.ts";
import type { Warning } from "../types.ts";
import type { AccountsWire, AccountsYearWire, AnnualAccountsWire, CertificateWire, CirbeWire, ExtractKind, SolvencyWire } from "./schemas.ts";

export interface AssessContext {
  fileName: string;
  caseCif: string;
  companyName: string;
  lenderName: string;
  /** Ejercicio expected for Modelo 200 / cuentas anuales (year the closed fiscal year starts), if known. */
  expectedFiscalYear: number | null;
}

export type Canonical =
  | { kind: "accounts"; data: Modelo200Extraction; periodEnd: string | null }
  | { kind: "annual_accounts"; data: AnnualAccountsExtraction }
  | { kind: "cirbe"; data: CirbeExtraction }
  | { kind: "certificate"; data: CertificateExtraction }
  | { kind: "solvency"; data: SolvencyReport };

export interface Assessment {
  status: "parsed" | "failed" | "needs_review";
  /** Borrower-facing fix when status is failed or needs_review. */
  attentionMessage: string | null;
  /** Issue/as-of date for freshness rules (certificates, CIRBE). */
  issuedOn: string | null;
  canonical: Canonical | null;
  warnings: Warning[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (s: string | null | undefined) => (s && ISO.test(s) ? s : null);

/** "ES-B12345674", "b 1234567-4" → "B12345674". */
export function cleanNif(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normalizeCif(raw).replace(/[^A-Z0-9]/g, "").replace(/^ES(?=[A-Z0-9]{9}$)/, "");
  return n || null;
}

const fail = (attentionMessage: string, warnings: Warning[] = []): Assessment => ({ status: "failed", attentionMessage, issuedOn: null, canonical: null, warnings });

type Wire = AccountsWire | AnnualAccountsWire | CirbeWire | CertificateWire | SolvencyWire;

/** Checks shared by every kind: legible, right document, right company. */
function identity(kind: ExtractKind, wire: Wire, ctx: AssessContext): Assessment | Warning[] {
  const warnings: Warning[] = [];
  if (!wire.legible) {
    return fail(`No se lee bien «${ctx.fileName}». Sube el PDF original descargado de la sede electrónica, no una foto o un escaneo.`);
  }
  if (wire.document_type !== kind) {
    const got = DOC_TYPE_LABEL[wire.document_type] ?? DOC_TYPE_LABEL.other;
    return fail(`«${ctx.fileName}» parece ${got}, no ${DOC_TYPE_LABEL[kind]}. Súbelo en el paso que le corresponde y aquí sube ${DOC_TYPE_LABEL[kind]}.`, [
      { code: "doc_type_mismatch", message: `Expected ${kind}, got ${wire.document_type}`, detail: { expected: kind, detected: wire.document_type } },
    ]);
  }
  const nif = cleanNif(wire.company_nif);
  const expected = cleanNif(ctx.caseCif);
  if (!nif) {
    warnings.push({ code: "doc_nif_missing", message: "No se ha encontrado el NIF de la empresa en el documento." });
  } else if (isValidCif(nif) && expected && nif !== expected) {
    return fail(`«${ctx.fileName}» es de otra empresa (NIF ${nif}). Necesitamos el de ${ctx.companyName} (${expected}).`, [
      { code: "doc_nif_mismatch", message: `NIF ${nif} does not match case CIF ${expected}`, detail: { found: nif, expected } },
    ]);
  } else if (!isValidCif(nif)) {
    warnings.push({ code: "doc_nif_unreadable", message: `NIF leído «${nif}» no es un CIF válido; no se ha podido comprobar la empresa.`, detail: { found: nif } });
  }
  return warnings;
}

function accounts(kind: "modelo200" | "cuentas_anuales", w: AccountsWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  if (ctx.expectedFiscalYear && w.fiscal_year && w.fiscal_year !== ctx.expectedFiscalYear) {
    const what = kind === "modelo200" ? "el Modelo 200" : "las cuentas anuales";
    return fail(`«${ctx.fileName}» es ${what} del ejercicio ${w.fiscal_year}. ${ctx.lenderName} necesita ${what} del ejercicio ${ctx.expectedFiscalYear}.`, [
      ...warnings,
      { code: "doc_fiscal_year_mismatch", message: `Fiscal year ${w.fiscal_year}, expected ${ctx.expectedFiscalYear}`, detail: { found: w.fiscal_year, expected: ctx.expectedFiscalYear } },
    ]);
  }
  const keys = { revenue: w.revenue, operatingResult: w.operating_result, preTaxResult: w.pre_tax_result, netIncome: w.net_income, equity: w.equity, totalAssets: w.total_assets };
  const fields = Object.fromEntries(Object.entries(keys).map(([k, f]) => [k, f.value])) as Modelo200Extraction["fields"];
  const sourcePages = Object.fromEntries(
    Object.entries(keys).filter(([, f]) => f.value !== null && f.page !== null && f.page > 0).map(([k, f]) => [k, f.page as number]),
  );
  const missingPages = Object.entries(keys).filter(([, f]) => f.value !== null && !(f.page && f.page > 0)).map(([k]) => k);
  if (missingPages.length) warnings.push({ code: "extract_missing_page", message: `Sin página de origen: ${missingPages.join(", ")}.`, detail: { fields: missingPages } });

  const parsed = Modelo200ExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    fiscalYear: w.fiscal_year ?? ctx.expectedFiscalYear ?? 0,
    fields,
    sourcePages,
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: null, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  if (Object.values(fields).every((v) => v === null)) {
    return fail(`No encontramos cifras en «${ctx.fileName}». Sube la declaración completa, con el balance y la cuenta de resultados.`, warnings);
  }
  return { status: "parsed", attentionMessage: null, issuedOn: null, canonical: { kind: "accounts", data: parsed.data, periodEnd: isoOrNull(w.period_end) }, warnings };
}

const pos = (p: number | null | undefined) => (p && p > 0 ? p : null);
const UNIT_FACTOR = { euros: 1, thousands: 1_000, millions: 1_000_000 } as const;
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** A model year column in euros, keys as in the canonical schema. */
function yearInEuros(y: AccountsYearWire, factor: number): AnnualAccountsExtraction["current"] {
  return Object.fromEntries(Object.entries(y).map(([k, v]) => [camel(k), Math.round(v * factor * 100) / 100])) as AnnualAccountsExtraction["current"];
}

/** Cuentas anuales on the official model: the full balance sheet and P&L, current and prior year. */
function annualAccounts(w: AnnualAccountsWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const fiscalYear = w.fiscal_year > 0 ? w.fiscal_year : null;
  if (ctx.expectedFiscalYear && fiscalYear && fiscalYear !== ctx.expectedFiscalYear) {
    return fail(`«${ctx.fileName}» son las cuentas anuales del ejercicio ${fiscalYear}. ${ctx.lenderName} necesita las del ejercicio ${ctx.expectedFiscalYear}.`, [
      ...warnings,
      { code: "doc_fiscal_year_mismatch", message: `Fiscal year ${fiscalYear}, expected ${ctx.expectedFiscalYear}`, detail: { found: fiscalYear, expected: ctx.expectedFiscalYear } },
    ]);
  }
  const cur = w.current_year;
  if (Object.values(cur).every((v) => v === 0)) {
    return fail(`No encontramos el balance ni la cuenta de resultados en «${ctx.fileName}». Sube las cuentas anuales completas, con el balance y la cuenta de pérdidas y ganancias.`, warnings);
  }
  if (cur.total_assets === 0 || (cur.revenue === 0 && cur.net_income === 0 && cur.operating_result === 0)) {
    warnings.push({ code: "ca_incomplete", message: "Las cuentas anuales no muestran el balance o la cuenta de resultados completos." });
  }
  const factor = UNIT_FACTOR[w.units];
  const parsed = AnnualAccountsExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    fiscalYear: fiscalYear ?? ctx.expectedFiscalYear ?? 0,
    periodEnd: isoOrNull(w.period_end),
    months: w.period_months > 0 && w.period_months <= 24 ? w.period_months : 12,
    model: w.model,
    pages: { balanceSheet: pos(w.balance_sheet_page), incomeStatement: pos(w.income_statement_page) },
    current: yearInEuros(cur, factor),
    prior: w.prior_year_shown && !Object.values(w.prior_year).every((v) => v === 0) ? yearInEuros(w.prior_year, factor) : null,
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: null, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  return { status: "parsed", attentionMessage: null, issuedOn: null, canonical: { kind: "annual_accounts", data: parsed.data }, warnings };
}

function cirbe(w: CirbeWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const asOf = isoOrNull(w.as_of);
  if (!asOf) {
    return {
      status: "needs_review",
      attentionMessage: `No encontramos la fecha de los datos en «${ctx.fileName}». Sube el informe CIRBE completo, tal como lo descargas del Banco de España.`,
      issuedOn: null,
      canonical: null,
      warnings: [...warnings, { code: "cirbe_no_date", message: "No se ha encontrado la fecha de los datos del informe CIRBE." }],
    };
  }
  const parsed = CirbeExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    asOf,
    positions: w.positions.map((p) => ({ entity: p.entity, product: p.product, drawn: p.drawn, limit: p.limit, overdue: p.overdue ?? 0, maturity: p.maturity, page: p.page })),
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: asOf, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  return { status: "parsed", attentionMessage: null, issuedOn: asOf, canonical: { kind: "cirbe", data: parsed.data }, warnings };
}

function certificate(kind: "aeat_cert" | "tgss_cert", w: CertificateWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const issuedOn = isoOrNull(w.issue_date);
  if (!issuedOn) {
    return {
      status: "needs_review",
      attentionMessage: `No encontramos la fecha de emisión en «${ctx.fileName}». Sube el certificado completo, tal como lo descargas de la sede electrónica.`,
      issuedOn: null,
      canonical: null,
      warnings: [...warnings, { code: "cert_no_date", message: "No se ha encontrado la fecha de emisión del certificado." }],
    };
  }
  const parsed = CertificateExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    issuer: kind === "aeat_cert" ? "aeat" : "tgss",
    issuedOn,
    validUntil: isoOrNull(w.valid_until),
    result: w.result,
    verificationCode: w.verification_code,
    page: w.page && w.page > 0 ? w.page : null,
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  // A negative certificate is a fact for the lender (a check), not something the borrower can fix by re-uploading.
  if (w.result === "no_al_corriente") warnings.push({ code: "cert_negative", message: "El certificado indica que la empresa no está al corriente." });
  return { status: "parsed", attentionMessage: null, issuedOn, canonical: { kind: "certificate", data: parsed.data }, warnings };
}

function solvency(w: SolvencyWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const reportDate = isoOrNull(w.report_date);
  if (!reportDate) {
    return {
      status: "needs_review",
      attentionMessage: `No encontramos la fecha del informe en «${ctx.fileName}». Sube el informe completo, tal como lo entrega el proveedor.`,
      issuedOn: null,
      canonical: null,
      warnings: [...warnings, { code: "solvency_no_date", message: "No se ha encontrado la fecha del informe de solvencia." }],
    };
  }
  // The wire uses sentinels instead of null (structured-output limit): "" for text, 0 for a page, -1 for an amount.
  const page = (p: number) => pos(p) ?? 1; // a missing page number should not reject the whole report
  const str = (v: string) => (v.trim() ? v.trim() : null);
  const money = (v: number) => (v >= 0 ? v : null);
  const pd = w.default_probability;
  const total = w.payment_incidents_total;
  const parsed = SolvencyReportSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    provider: w.provider,
    providerName: str(w.provider_name),
    reportDate,
    rating: str(w.rating.value) ? { value: str(w.rating.value), scale: str(w.rating.scale), description: str(w.rating.description), page: pos(w.rating.page) } : null,
    defaultProbability: pd.percent >= 0 && pd.percent <= 100 ? { percent: pd.percent, horizonMonths: pd.horizon_months > 0 ? pd.horizon_months : null, page: pos(pd.page) } : null,
    creditLimit: money(w.credit_limit.amount) !== null ? { amount: w.credit_limit.amount, page: pos(w.credit_limit.page) } : null,
    incidents: w.payment_incidents.map((i) => ({ registry: i.registry, registryName: str(i.registry_name), creditor: str(i.creditor), amount: money(i.amount), date: isoOrNull(i.date), status: i.status, page: page(i.page) })),
    incidentsTotal: total.count >= 0 || money(total.amount) !== null ? { count: total.count >= 0 ? total.count : null, amount: money(total.amount), page: pos(total.page) } : null,
    judicial: w.judicial_incidents.map((j) => ({ type: j.type, description: j.description, amount: money(j.amount), date: isoOrNull(j.date), status: j.status, page: page(j.page) })),
    financials: w.financials.map((f) => ({ fiscalYear: f.fiscal_year, revenue: f.revenue, netIncome: f.net_income, equity: f.equity, totalAssets: f.total_assets, page: page(f.page) })),
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: reportDate, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  return { status: "parsed", attentionMessage: null, issuedOn: reportDate, canonical: { kind: "solvency", data: parsed.data }, warnings };
}

export function assessExtraction(kind: ExtractKind, wire: Wire, ctx: AssessContext): Assessment {
  const id = identity(kind, wire, ctx);
  if (!Array.isArray(id)) return id;
  switch (kind) {
    case "modelo200":
      return accounts(kind, wire as AccountsWire, ctx, id);
    case "cuentas_anuales":
      return annualAccounts(wire as AnnualAccountsWire, ctx, id);
    case "cirbe":
      return cirbe(wire as CirbeWire, ctx, id);
    case "aeat_cert":
    case "tgss_cert":
      return certificate(kind, wire as CertificateWire, ctx, id);
    case "solvency_report":
      return solvency(wire as SolvencyWire, ctx, id);
  }
}
