/**
 * Cross-checks between sources. Pure functions: each returns CheckResults with the values compared and the
 * source references behind them, so the lender can open the evidence. Checks flag inconsistencies for the lender
 * to look at; they never score, approve or decline.
 */
import type { CanonicalStatement } from "../pgc/mapping.ts";
import type { CertificateExtraction, CirbeExtraction, Modelo200Extraction } from "../schema/canonical.ts";
import { minRunningBalance, type N43Account } from "../parsers/norma43.ts";
import { monthsBetween } from "../types.ts";

export type Severity = "info" | "warn" | "high";

export interface CheckResult {
  key: string;
  status: "pass" | "fail" | "not_applicable";
  severity: Severity;
  message: string;
  evidence: {
    values: Record<string, number | string | null>;
    sources: string[];
    rule?: string;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} €`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

const lineageRefs = (s: CanonicalStatement, ...lines: (keyof CanonicalStatement["lineage"])[]) =>
  lines.flatMap((l) => (s.lineage[l] ?? []).map((c) => c.sourceRef));

const na = (key: string, message: string): CheckResult => ({ key, status: "not_applicable", severity: "info", message, evidence: { values: {}, sources: [] } });

// ---------------------------------------------------------------------------------------------------------------
// CIRBE vs books

/** Contingent risks (guarantees) are not financial debt on the balance sheet. */
const CONTINGENT = /\baval|garant|fianza|credito documentario|compromiso/i;

export function checkCirbeVsBooks(s: CanonicalStatement, cirbe: CirbeExtraction, cirbeDocId: string): CheckResult[] {
  const debtPositions = cirbe.positions.filter((p) => !CONTINGENT.test(p.product));
  const cirbeDrawn = r2(debtPositions.reduce((sum, p) => sum + p.drawn, 0));
  const books = r2(s.derived.financialDebt);
  const diff = r2(cirbeDrawn - books);
  const base = Math.max(Math.abs(cirbeDrawn), Math.abs(books), 1);
  const rel = Math.abs(diff) / base;
  const sources = [...lineageRefs(s, "longTermFinancialDebt", "shortTermFinancialDebt"), ...debtPositions.map((p) => `doc:${cirbeDocId}:page:${p.page}`)];
  const values = { cirbe_drawn: cirbeDrawn, books_financial_debt: books, difference: diff, cirbe_as_of: cirbe.asOf, statement_period_end: s.period.end };
  const rule = "Dispuesto CIRBE (sin avales) vs deuda financiera contable; tolerancia 10 % o 5.000 €";

  const out: CheckResult[] = [];
  if (Math.abs(diff) <= 5000 || rel <= 0.1) {
    out.push({ key: "cirbe_vs_books_debt", status: "pass", severity: "info", message: `La deuda en CIRBE (${eur(cirbeDrawn)}) coincide con la contable (${eur(books)}).`, evidence: { values, sources, rule } });
  } else if (diff > 0) {
    out.push({
      key: "cirbe_vs_books_debt",
      status: "fail",
      severity: rel > 0.25 ? "high" : "warn",
      message: `CIRBE declara ${eur(cirbeDrawn)} de deuda dispuesta y la contabilidad ${eur(books)}: ${eur(diff)} (${pct(rel)}) sin reflejar en libros.`,
      evidence: { values, sources, rule },
    });
  } else {
    out.push({
      key: "cirbe_vs_books_debt",
      status: "fail",
      severity: "warn",
      message: `La contabilidad registra ${eur(books)} de deuda financiera y CIRBE ${eur(cirbeDrawn)}: ${eur(-diff)} no aparecen en CIRBE (préstamos de socios o entidades no declarantes, o fechas distintas).`,
      evidence: { values, sources, rule },
    });
  }

  const overdue = r2(cirbe.positions.reduce((sum, p) => sum + (p.overdue ?? 0), 0));
  const overdueSources = cirbe.positions.filter((p) => (p.overdue ?? 0) > 0).map((p) => `doc:${cirbeDocId}:page:${p.page}`);
  out.push(
    overdue > 0
      ? { key: "cirbe_overdue", status: "fail", severity: "high", message: `CIRBE muestra ${eur(overdue)} de riesgo vencido o dudoso.`, evidence: { values: { overdue, cirbe_as_of: cirbe.asOf }, sources: overdueSources } }
      : { key: "cirbe_overdue", status: "pass", severity: "info", message: "CIRBE no muestra importes vencidos.", evidence: { values: { overdue: 0, cirbe_as_of: cirbe.asOf }, sources: [`doc:${cirbeDocId}`] } },
  );
  return out;
}

/** Principal due in 12 months from CIRBE maturities, when they are readable ("< 1 año", "vencimiento 2026-…"). */
export function cirbeAnnualPrincipal(cirbe: CirbeExtraction): number | undefined {
  let total = 0;
  let known = false;
  for (const p of cirbe.positions) {
    if (CONTINGENT.test(p.product)) continue;
    const m = (p.maturity ?? "").toLowerCase();
    if (/(menos de|<|hasta)\s*1\s*a[nñ]o|corto plazo|a la vista/.test(m)) {
      total += p.drawn;
      known = true;
    } else if (/(\d+)\s*a[nñ]os?|m[aá]s de 1 a[nñ]o|largo plazo/.test(m)) known = true;
  }
  return known ? r2(total) : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Bank inflows (Norma 43) vs revenue

export function checkN43InflowsVsRevenue(s: CanonicalStatement, accounts: N43Account[], vatRate = 0.21): CheckResult {
  const key = "n43_inflows_vs_revenue";
  if (!s.pnlAvailable) return na(key, "Sin cuenta de resultados para comparar con los cobros bancarios.");
  const start = [s.period.start, ...accounts.map((a) => a.start)].sort().at(-1)!;
  const end = [s.period.end, ...accounts.map((a) => a.end)].sort()[0];
  if (start > end) return na(key, "Los extractos bancarios no cubren el periodo de la contabilidad.");
  const overlapMonths = monthsBetween(start, end);
  if (overlapMonths < 1) return na(key, "Los extractos bancarios cubren menos de un mes del periodo contable.");

  const txs = accounts.flatMap((a) => a.transactions).filter((t) => t.amount > 0 && t.bookingDate >= start && t.bookingDate <= end && t.category === "revenue");
  const inflows = r2(txs.reduce((sum, t) => sum + t.amount, 0));
  const expected = r2(s.incomeStatement.revenue * (overlapMonths / s.months) * (1 + vatRate));
  const values = { bank_inflows: inflows, expected_from_revenue: expected, overlap_start: start, overlap_end: end, overlap_months: overlapMonths, vat_rate: vatRate };
  const sources = [...lineageRefs(s, "revenue"), ...txs.slice(0, 50).map((t) => t.sourceRef)];
  const rule = `Cobros bancarios (ingresos) vs ventas × ${1 + vatRate} prorrateadas al periodo común; tolerancia ±25 %`;
  if (expected <= 0) return na(key, "Sin ventas en el periodo para comparar.");
  const ratio = inflows / expected;
  if (ratio >= 0.75 && ratio <= 1.25) {
    return { key, status: "pass", severity: "info", message: `Los cobros bancarios (${eur(inflows)}) son coherentes con las ventas (${eur(expected)} con IVA).`, evidence: { values: { ...values, ratio: r2(ratio) }, sources, rule } };
  }
  return {
    key,
    status: "fail",
    severity: "warn",
    message:
      ratio < 0.75
        ? `Los cobros bancarios (${eur(inflows)}) son un ${pct(1 - ratio)} inferiores a las ventas con IVA del periodo (${eur(expected)}). Puede faltar alguna cuenta bancaria o cobrarse por otros medios.`
        : `Los cobros bancarios (${eur(inflows)}) superan en un ${pct(ratio - 1)} a las ventas con IVA del periodo (${eur(expected)}). Pueden incluir financiación, aportaciones o traspasos.`,
    evidence: { values: { ...values, ratio: r2(ratio) }, sources, rule },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Modelo 200 vs closed-year books

const PNL_LINES = [
  "revenue", "otherOperatingIncome", "grantsTransferred", "nonRecurringResult", "financialIncome", "cogs", "externalServices", "otherTaxes",
  "personnel", "otherOperatingExpenses", "depreciation", "operatingImpairments", "financialExpense", "financialImpairments", "incomeTax",
] as const;

const M200_FIELDS: [keyof Modelo200Extraction["fields"], keyof CanonicalStatement["incomeStatement"] | "equity", string][] = [
  ["revenue", "revenue", "Cifra de negocios"],
  ["netIncome", "netIncome", "Resultado del ejercicio"],
  ["equity", "equity", "Patrimonio neto"],
];

export function checkModelo200VsBooks(closed: CanonicalStatement, m200: Modelo200Extraction, docId: string): CheckResult[] {
  return M200_FIELDS.map(([field, line, label]) => {
    const key = `m200_vs_books_${field}`;
    const declared = m200.fields[field];
    if (declared === null) return na(key, `${label}: no figura en el Modelo 200.`);
    const books = line === "equity" ? closed.balanceSheet.equityAndLiabilities.equity : closed.incomeStatement[line];
    const diff = r2(books - declared);
    const rel = Math.abs(diff) / Math.max(Math.abs(declared), Math.abs(books), 1);
    const page = m200.sourcePages[field];
    const bookRefs =
      field === "revenue" ? lineageRefs(closed, "revenue") : field === "equity" ? lineageRefs(closed, "equity") : lineageRefs(closed, ...PNL_LINES);
    const sources = [...bookRefs, `doc:${docId}${page ? `:page:${page}` : ""}`];
    const values = { modelo200: declared, books, difference: diff, fiscal_year: m200.fiscalYear };
    const rule = "Tolerancia 1 % o 1.000 €";
    if (Math.abs(diff) <= 1000 || rel <= 0.01) {
      return { key, status: "pass", severity: "info", message: `${label} coincide con el Modelo 200 (${eur(declared)}).`, evidence: { values, sources, rule } };
    }
    return {
      key,
      status: "fail",
      severity: rel > 0.05 && field !== "equity" ? "high" : "warn",
      message: `${label}: la contabilidad del ejercicio cerrado muestra ${eur(books)} y el Modelo 200 ${eur(declared)} (diferencia ${eur(diff)}, ${pct(rel)}).`,
      evidence: { values, sources, rule },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Certificates

export function checkCertificate(kind: "aeat_cert" | "tgss_cert", cert: CertificateExtraction | null, docId: string | null, maxAgeDays: number | null, today: string): CheckResult {
  const key = `${kind}_valid`;
  const who = kind === "aeat_cert" ? "Hacienda" : "la Seguridad Social";
  if (!cert || !docId) return na(key, `Sin certificado de ${who} leído.`);
  const source = `doc:${docId}${cert.page ? `:page:${cert.page}` : ""}`;
  const values = { issued_on: cert.issuedOn, valid_until: cert.validUntil, result: cert.result, max_age_days: maxAgeDays, verification_code: cert.verificationCode };
  if (cert.result === "no_al_corriente") {
    return { key, status: "fail", severity: "high", message: `El certificado de ${who} indica que la empresa NO está al corriente.`, evidence: { values, sources: [source] } };
  }
  if (cert.result === "unknown") {
    return { key, status: "fail", severity: "warn", message: `No se ha podido leer el resultado del certificado de ${who}.`, evidence: { values, sources: [source] } };
  }
  const expired = cert.validUntil !== null && cert.validUntil < today;
  const ageDays = cert.issuedOn ? Math.round((Date.parse(today) - Date.parse(cert.issuedOn)) / 86_400_000) : null;
  const tooOld = maxAgeDays !== null && ageDays !== null && ageDays > maxAgeDays;
  if (expired || tooOld) {
    return {
      key,
      status: "fail",
      severity: "warn",
      message: expired ? `El certificado de ${who} caducó el ${cert.validUntil}.` : `El certificado de ${who} tiene ${ageDays} días (máximo ${maxAgeDays}).`,
      evidence: { values: { ...values, age_days: ageDays }, sources: [source] },
    };
  }
  return { key, status: "pass", severity: "info", message: `Certificado de ${who}: al corriente, emitido el ${cert.issuedOn}.`, evidence: { values: { ...values, age_days: ageDays }, sources: [source] } };
}

// ---------------------------------------------------------------------------------------------------------------
// Bank accounts: overdrafts and debt payments

export function checkOverdrafts(accounts: N43Account[]): CheckResult {
  const key = "n43_overdrawn";
  if (accounts.length === 0) return na(key, "Sin extractos bancarios.");
  const overdrawn = accounts.map((a) => ({ a, min: minRunningBalance(a) })).filter((x) => x.min.balance < 0);
  if (overdrawn.length === 0) {
    return { key, status: "pass", severity: "info", message: "Ninguna cuenta bancaria queda en descubierto en el periodo.", evidence: { values: { accounts: accounts.length }, sources: [] } };
  }
  return {
    key,
    status: "fail",
    severity: "warn",
    message: `${overdrawn.length === 1 ? "Una cuenta queda" : `${overdrawn.length} cuentas quedan`} en descubierto: ${overdrawn.map((x) => `${x.a.accountMasked} (${eur(x.min.balance)} el ${x.min.date})`).join("; ")}.`,
    evidence: {
      values: Object.fromEntries(overdrawn.map((x) => [x.a.accountMasked, x.min.balance])),
      sources: overdrawn.flatMap((x) => x.a.transactions.filter((t) => t.bookingDate === x.min.date).map((t) => t.sourceRef)),
    },
  };
}

export function checkDebtPaymentsVsDeclaredDebt(accounts: N43Account[], s: CanonicalStatement | null, cirbe: CirbeExtraction | null): CheckResult {
  const key = "n43_debt_payments_vs_declared";
  const payments = accounts.flatMap((a) => a.transactions).filter((t) => t.category === "debt_service" && t.amount < 0);
  const months = new Set(payments.map((t) => t.bookingDate.slice(0, 7)));
  if (months.size < 2) return na(key, "Sin pagos de deuda recurrentes en los extractos.");
  const total = r2(-payments.reduce((sum, t) => sum + t.amount, 0));
  const booksDebt = s?.derived.financialDebt ?? 0;
  const cirbeDebt = cirbe ? cirbe.positions.filter((p) => !CONTINGENT.test(p.product)).reduce((sum, p) => sum + p.drawn, 0) : 0;
  const values = { debt_payments: total, months_with_payments: months.size, books_financial_debt: r2(booksDebt), cirbe_drawn: r2(cirbeDebt) };
  const sources = payments.slice(0, 50).map((t) => t.sourceRef);
  if (booksDebt <= 0 && cirbeDebt <= 0) {
    return { key, status: "fail", severity: "high", message: `Hay pagos recurrentes de préstamos en los extractos (${eur(total)} en ${months.size} meses) pero no consta deuda financiera ni en contabilidad ni en CIRBE.`, evidence: { values, sources } };
  }
  return { key, status: "pass", severity: "info", message: `Los pagos de deuda en los extractos (${eur(total)} en ${months.size} meses) corresponden a deuda declarada.`, evidence: { values, sources } };
}
