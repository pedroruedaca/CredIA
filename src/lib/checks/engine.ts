/**
 * Cross-checks between sources. Pure functions: each returns CheckResults with the values compared and the
 * source references behind them, so the lender can open the evidence. Checks flag inconsistencies for the lender
 * to look at; they never score, approve or decline.
 */
import type { CanonicalStatement } from "../pgc/mapping.ts";
import { JUDICIAL_TYPE_LABEL, SOLVENCY_PROVIDER_LABEL } from "../../content/solvency.es.ts";
import type { CertificateExtraction, CirbeExtraction, Modelo200Extraction, SolvencyReport } from "../schema/canonical.ts";
import { declaredSales, expectedQuarters, quarterCoverage, quarterLabel, returnLabel, returnsForPeriod, type M303Return } from "../tax/modelo303.ts";
import { inflowBreakdown } from "../bank/classify.ts";
import { holderVerdict } from "../bank/holder.ts";
import { minRunningBalance, type N43Account } from "../parsers/norma43.ts";
import { monthsBetween } from "../types.ts";
import { de } from "../format.ts";

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

/** Drawn financial debt in a CIRBE report, excluding contingent risks (guarantees). */
export function cirbeDrawnDebt(cirbe: CirbeExtraction): number {
  return r2(cirbe.positions.filter((p) => !CONTINGENT.test(p.product)).reduce((sum, p) => sum + p.drawn, 0));
}

/** Same tolerance as the CIRBE check: within 5.000 € or 10 %. */
export function withinDebtTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= 5000 || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= 0.1;
}

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
  // Revenue alone is enough here, so sales declared in the Modelo 303 also count.
  if (!s.pnlAvailable && s.scope !== "revenue") return na(key, "Sin cuenta de resultados para comparar con los cobros bancarios.");
  const start = [s.period.start, ...accounts.map((a) => a.start)].sort().at(-1)!;
  const end = [s.period.end, ...accounts.map((a) => a.end)].sort()[0];
  if (start > end) return na(key, "Los extractos bancarios no cubren el periodo de la contabilidad.");
  const overlapMonths = monthsBetween(start, end);
  if (overlapMonths < 1) return na(key, "Los extractos bancarios cubren menos de un mes del periodo contable.");

  const inPeriod = accounts.flatMap((a) => a.transactions).filter((t) => t.bookingDate >= start && t.bookingDate <= end);
  const b = inflowBreakdown(inPeriod);
  const inflows = b.receipts;
  const expected = r2(s.incomeStatement.revenue * (overlapMonths / s.months) * (1 + vatRate));
  // Every inflow left out of receipts is listed by type, so the lender sees what was not counted as sales.
  const excluded = Object.fromEntries(Object.entries(b.excluded).map(([cat, v]) => [`excluded_${cat}`, v as number]));
  const values = {
    bank_inflows: inflows,
    expected_from_revenue: expected,
    identified_receipts: b.identifiedReceipts,
    unclassified_inflows: b.unclassified,
    returned_receipts: b.returnedReceipts,
    ...excluded,
    total_bank_inflows: b.total,
    overlap_start: start,
    overlap_end: end,
    overlap_months: overlapMonths,
    vat_rate: vatRate,
  };
  const sources = [...lineageRefs(s, "revenue"), ...b.counted.slice(0, 50).map((t) => t.sourceRef)];
  const rule =
    `Cobros de clientes (más ingresos sin clasificar, menos recibos devueltos) vs ventas × ${1 + vatRate} prorrateadas al periodo común; ` +
    "tolerancia ±25 %. No cuentan como cobros: traspasos entre cuentas propias, financiación, anticipos y descuento, aportaciones de socios, devoluciones, inversiones ni anulaciones.";
  if (expected <= 0) return na(key, "Sin ventas en el periodo para comparar.");
  const ratio = inflows / expected;
  // Unclassified money is counted (most of it is customers paying) but said, so a pass is not taken as certain.
  const unclassifiedNote =
    b.unclassified > 0 && b.unclassified >= 0.2 * Math.max(inflows, 1)
      ? ` ${eur(b.unclassified)} de los cobros (${pct(b.unclassified / Math.max(inflows, 1))}) son ingresos sin identificar.`
      : "";
  const excludedTotal = r2(Object.values(b.excluded).reduce((x, v) => x + (v ?? 0), 0));
  const excludedNote = excludedTotal > 0 ? ` No se cuentan ${eur(excludedTotal)} de traspasos, financiación y otros ingresos que no son ventas.` : "";
  if (ratio >= 0.75 && ratio <= 1.25) {
    return { key, status: "pass", severity: "info", message: `Los cobros bancarios (${eur(inflows)}) son coherentes con las ventas (${eur(expected)} con IVA).${excludedNote}${unclassifiedNote}`, evidence: { values: { ...values, ratio: r2(ratio) }, sources, rule } };
  }
  return {
    key,
    status: "fail",
    severity: "warn",
    message:
      (ratio < 0.75
        ? `Los cobros bancarios (${eur(inflows)}) son un ${pct(1 - ratio)} inferiores a las ventas con IVA del periodo (${eur(expected)}). Puede faltar alguna cuenta bancaria o cobrarse por otros medios.`
        : `Los cobros bancarios (${eur(inflows)}) superan en un ${pct(ratio - 1)} a las ventas con IVA del periodo (${eur(expected)}).`) +
      excludedNote +
      unclassifiedNote,
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
  // Exports without running balances cannot say when an account was overdrawn.
  const known = accounts.filter((a) => a.balancesKnown !== false);
  if (known.length === 0) return na(key, "Los extractos no traen saldos.");
  const overdrawn = known.map((a) => ({ a, min: minRunningBalance(a) })).filter((x) => x.min.balance < 0);
  if (overdrawn.length === 0) {
    return { key, status: "pass", severity: "info", message: "Ninguna cuenta bancaria queda en descubierto en el periodo.", evidence: { values: { accounts: known.length }, sources: [] } };
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
  // Instalments and interest on credit lines: what the company pays its lenders.
  const payments = accounts.flatMap((a) => a.transactions).filter((t) => (t.category === "debt_service" || t.category === "interest") && t.amount < 0);
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

/**
 * Money lent to the company that arrived through the bank: loan and credit-line drawdowns, and advances on invoices
 * (factoring, discounting, anticipos). With none declared in the books or the CIRBE, it is undeclared debt (high).
 */
export function checkFinancingInflows(accounts: N43Account[], s: CanonicalStatement | null, cirbe: CirbeExtraction | null): CheckResult {
  const key = "n43_financing_inflows";
  const txs = accounts.flatMap((a) => a.transactions).filter((t) => t.amount > 0 && (t.category === "financing" || t.category === "trade_finance"));
  if (txs.length === 0) return na(key, "Sin entradas de financiación en los extractos.");
  const loans = r2(txs.filter((t) => t.category === "financing").reduce((x, t) => x + t.amount, 0));
  const advances = r2(txs.filter((t) => t.category === "trade_finance").reduce((x, t) => x + t.amount, 0));
  const booksDebt = s?.derived.financialDebt ?? 0;
  const cirbeDebt = cirbe ? cirbeDrawnDebt(cirbe) : 0;
  const values = { financing_inflows: loans, trade_finance_inflows: advances, books_financial_debt: r2(booksDebt), cirbe_drawn: r2(cirbeDebt) };
  const sources = txs.slice(0, 50).map((t) => t.sourceRef);
  const what = [loans > 0 ? `${eur(loans)} de préstamos o pólizas` : null, advances > 0 ? `${eur(advances)} de anticipos, factoring o descuento` : null].filter(Boolean).join(" y ");
  const rule = "Ingresos clasificados como financiación en los extractos frente a la deuda financiera en contabilidad y en CIRBE";
  if (booksDebt <= 0 && cirbeDebt <= 0) {
    return { key, status: "fail", severity: "high", message: `Entran ${what} en los extractos, pero no consta deuda financiera ni en contabilidad ni en CIRBE.`, evidence: { values, sources, rule } };
  }
  return { key, status: "pass", severity: "info", message: `Entran ${what} en los extractos; consta deuda financiera declarada.`, evidence: { values, sources, rule } };
}

// ---------------------------------------------------------------------------------------------------------------
// Informe de solvencia (third-party commercial report)

/**
 * Facts from a commercial credit report: payment incidents, judicial incidents, and its revenue vs the books for
 * the closed year. The provider's rating, probability of default and credit limit are shown in the case view as the
 * provider's figures; they never feed a check.
 */
export function checkSolvencyReport(r: SolvencyReport, docId: string, closed: CanonicalStatement | null): CheckResult[] {
  const who = SOLVENCY_PROVIDER_LABEL[r.provider] ?? SOLVENCY_PROVIDER_LABEL.other;
  const ref = (page: number | null) => (page ? `doc:${docId}:page:${page}` : `doc:${docId}`);
  const out: CheckResult[] = [];
  const base = { provider: who, report_date: r.reportDate };

  // Payment incidents: the detail when listed, else the report's summary count.
  const active = r.incidents.filter((i) => i.status !== "resolved");
  const summaryCount = r.incidentsTotal?.count ?? null;
  const count = active.length || (r.incidents.length === 0 ? summaryCount ?? 0 : 0);
  const amount = active.length ? r2(active.reduce((sum, i) => sum + (i.amount ?? 0), 0)) : r.incidents.length === 0 ? (r.incidentsTotal?.amount ?? null) : 0;
  const incidentSources = active.length ? active.map((i) => ref(i.page)) : [ref(r.incidentsTotal?.page ?? null)];
  out.push(
    count > 0
      ? {
          key: "solvency_payment_incidents",
          status: "fail",
          severity: "high",
          message: `El informe de ${who} recoge ${count} ${count === 1 ? "incidencia de pago activa" : "incidencias de pago activas"}${amount ? ` por ${eur(amount)}` : ""}.`,
          evidence: { values: { ...base, incidents: count, amount }, sources: incidentSources, rule: "Incidencias no resueltas en RAI, ASNEF-Empresas u otros ficheros de impagos" },
        }
      : { key: "solvency_payment_incidents", status: "pass", severity: "info", message: `El informe de ${who} no recoge incidencias de pago activas.`, evidence: { values: { ...base, incidents: 0 }, sources: incidentSources } },
  );

  const openJudicial = r.judicial.filter((j) => j.status !== "resolved");
  const serious = openJudicial.filter((j) => j.type === "concurso" || j.type === "embargo");
  if (openJudicial.length) {
    const types = [...new Set(openJudicial.map((j) => JUDICIAL_TYPE_LABEL[j.type] ?? j.type))].join(", ").toLowerCase();
    const total = r2(openJudicial.reduce((sum, j) => sum + (j.amount ?? 0), 0));
    out.push({
      key: "solvency_judicial",
      status: "fail",
      severity: serious.length ? "high" : "warn",
      message: `El informe de ${who} recoge ${openJudicial.length} ${openJudicial.length === 1 ? "incidencia judicial o administrativa" : "incidencias judiciales o administrativas"} sin resolver: ${types}.`,
      evidence: { values: { ...base, incidents: openJudicial.length, amount: total || null }, sources: openJudicial.map((j) => ref(j.page)), rule: "Concursos y embargos: alta; demandas y reclamaciones de organismos públicos: media" },
    });
  } else {
    out.push({ key: "solvency_judicial", status: "pass", severity: "info", message: `El informe de ${who} no recoge incidencias judiciales sin resolver.`, evidence: { values: base, sources: [`doc:${docId}`] } });
  }

  // Revenue the report shows for the closed year vs the books (same tolerance as the Modelo 200 comparison).
  if (closed?.pnlAvailable && closed.months === 12) {
    const year = Number(closed.period.start.slice(0, 4));
    const f = r.financials.find((x) => x.fiscalYear === year && x.revenue !== null);
    if (f) {
      const books = r2(closed.incomeStatement.revenue);
      const diff = r2(books - f.revenue!);
      const ok = Math.abs(diff) <= 5000 || Math.abs(diff) / Math.max(Math.abs(books), Math.abs(f.revenue!), 1) <= 0.1;
      out.push({
        key: "solvency_vs_books_revenue",
        status: ok ? "pass" : "fail",
        severity: ok ? "info" : "warn",
        message: ok
          ? `Las ventas ${year} del informe de ${who} cuadran con la contabilidad.`
          : `Las ventas ${year} según ${who} (${eur(f.revenue!)}) difieren de la contabilidad (${eur(books)}).`,
        evidence: {
          values: { ...base, fiscal_year: year, report: f.revenue, books, difference: diff },
          sources: [ref(f.page), ...lineageRefs(closed, "revenue")],
          rule: "Cifra de negocios del informe vs libros del ejercicio cerrado; tolerancia 10 % o 5.000 €",
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Modelo 303: the last 4 quarters filed

/**
 * Which of the last 4 quarters already due are covered by the Modelo 303 returns received (quarterly, or three
 * monthly returns). Evidence: the sales declared per quarter (declaredSales), keyed by quarter label ("2T 26").
 * The newest upload wins when the same period appears twice (a complementaria).
 */
export function checkModelo303Quarters(returns: M303Return[], today: string): CheckResult {
  const key = "m303_quarters";
  if (returns.length === 0) return na(key, "No hay declaraciones de IVA leídas.");
  const byPeriod = new Map<string, (typeof returns)[number]>();
  for (const r of [...returns].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) byPeriod.set(`${r.data.fiscalYear}-${r.data.period}`, r);
  const latest = [...byPeriod.values()];
  const expected = expectedQuarters(today);
  const { missing } = quarterCoverage(latest.map((r) => ({ start: r.data.periodStart, end: r.data.periodEnd })), expected);

  const values: Record<string, number | string | null> = {};
  const sources: string[] = [];
  for (const q of expected) {
    const inQ = latest.filter((r) => r.data.periodStart >= q.start && r.data.periodEnd <= q.end);
    const isMissing = missing.includes(q);
    values[quarterLabel(q)] = isMissing ? null : r2(inQ.reduce((s, r) => s + declaredSales(r.data), 0));
    if (!isMissing) sources.push(...inQ.map((r) => `doc:${r.docId}${r.data.page ? `:page:${r.data.page}` : ""}`));
  }
  const rule = "Últimos 4 trimestres con plazo de presentación vencido (día 20 del mes siguiente; 30 de enero el cuarto)";
  if (missing.length === 0) {
    return { key, status: "pass", severity: "info", message: `Modelo 303 de los últimos 4 trimestres (${quarterLabel(expected[0])} a ${quarterLabel(expected[3])}).`, evidence: { values, sources, rule } };
  }
  const list = missing.map(quarterLabel);
  return {
    key,
    status: "fail",
    severity: "warn",
    message: `Falta${list.length > 1 ? "n" : ""} el Modelo 303 de ${list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list.at(-1)}` : list[0]}.`,
    evidence: { values, sources, rule },
  };
}

/**
 * Sales declared in the Modelo 303 vs the revenue of a statement whose period the returns cover month by month
 * (closed year, or a year to date ending on a month end). Not for a statement built from the 303 itself.
 * `booksLabel` names where the statement comes from: "la contabilidad", "las cuentas anuales", "el Modelo 200".
 */
export function checkModelo303VsBooks(s: CanonicalStatement, returns: M303Return[], booksLabel = "la contabilidad"): CheckResult {
  const key = "m303_vs_books_revenue";
  if (!s.pnlAvailable) return na(key, "Sin cuenta de resultados para comparar con el IVA declarado.");
  const { used, complete } = returnsForPeriod(returns, s.period.start, s.period.end);
  if (!complete || used.length === 0) return na(key, "Los Modelos 303 no cubren todos los meses del periodo contable.");
  const declared = r2(used.reduce((sum, r) => sum + declaredSales(r.data), 0));
  const books = r2(s.incomeStatement.revenue);
  const diff = r2(books - declared);
  const ok = Math.abs(diff) <= 5000 || Math.abs(diff) / Math.max(Math.abs(books), Math.abs(declared), 1) <= 0.1;
  const period = s.period.kind === "closed_fy" ? `del ejercicio ${s.period.end.slice(0, 4)}` : `de ${returnLabel(used[0].data)} a ${returnLabel(used.at(-1)!.data)}`;
  const values = { declared_sales: declared, books, difference: diff, period_start: s.period.start, period_end: s.period.end, returns: used.length };
  const sources = [...used.map((r) => `doc:${r.docId}${r.data.page ? `:page:${r.data.page}` : ""}`), ...lineageRefs(s, "revenue")];
  const rule = "Bases devengadas + entregas intracomunitarias + exportaciones + no sujetas y con inversión del sujeto pasivo (Modelo 303) vs cifra de negocios; tolerancia 10 % o 5.000 €";
  if (ok) {
    return { key, status: "pass", severity: "info", message: `Las ventas declaradas en IVA ${period} (${eur(declared)}) cuadran con ${booksLabel} (${eur(books)}).`, evidence: { values, sources, rule } };
  }
  return {
    key,
    status: "fail",
    severity: "warn",
    message: `Las ventas declaradas en IVA ${period} (${eur(declared)}) difieren ${de(booksLabel)} (${eur(books)}; diferencia ${eur(diff)}). Puede deberse a ventas exentas, de inmovilizado o a ajustes de periodo.`,
    evidence: { values, sources, rule },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Whose bank accounts (credIA covers companies only)

export const BANK_HOLDER_CHECK = "bank_holder_mismatch";

/**
 * Accounts whose printed holder is clearly not the company stay out of every bank figure and check until the lender
 * confirms they are the company's, by marking this check as reviewed (`acceptedAt`: when; files uploaded after that are
 * checked again). Returns the accounts to use and the check (null when every holder matches or cannot be compared).
 */
export function bankHolderCheck<T extends { docId: string; uploadedAt: string; account: N43Account }>(
  bank: T[],
  companyName: string | null,
  acceptedAt: string | null,
): { used: T[]; check: CheckResult | null } {
  const mismatched = bank.filter((b) => holderVerdict(b.account.name, companyName) === "mismatch");
  if (!mismatched.length) return { used: bank, check: null };
  const held = mismatched.filter((b) => !acceptedAt || b.uploadedAt > acceptedAt);
  const list = (xs: T[]) => xs.map((b) => `«${b.account.name}» (${b.account.accountMasked})`).join(", ");
  const message = held.length
    ? held.length === 1
      ? `Una cuenta está a nombre de otro titular y no se usa en los indicadores ni en las verificaciones: ${list(held)}. Si es de la empresa, marca esta alerta como revisada y se incluirá.`
      : `${held.length} cuentas están a nombre de otro titular y no se usan en los indicadores ni en las verificaciones: ${list(held)}. Si son de la empresa, marca esta alerta como revisada y se incluirán.`
    : `Cuentas a nombre de otro titular, confirmadas como de la empresa y usadas: ${list(mismatched)}.`;
  return {
    used: bank.filter((b) => !held.includes(b)),
    check: {
      key: BANK_HOLDER_CHECK,
      status: "fail",
      severity: "warn",
      message,
      evidence: {
        values: Object.fromEntries(mismatched.map((b) => [b.account.accountMasked, b.account.name])),
        sources: [...new Set(mismatched.map((b) => `doc:${b.docId}`))],
        rule: "Titular del extracto distinto de la empresa del caso (sin forma jurídica; nombres recortados admitidos)",
      },
    },
  };
}
