/**
 * Bank KPIs: cash indicators read from the company's bank movements (Norma 43), independent of the books. Pure.
 *
 * Input: the case's accounts after classifyAccounts (src/lib/bank/classify.ts), all files together. Balances are
 * end-of-day and combined across accounts. The analysis window is the last 12 months up to the latest day any file
 * covers; an account that does not cover the whole window keeps its opening balance before its first file and its
 * closing balance after its last one (no movements are known there), and the KPIs say so in a note.
 *
 * Like the accounting KPIs, each returns value, formula and inputs; no thresholds, no score: the lender interprets.
 */
import type { BankCategory } from "../bank/classify.ts";
import { formatDate } from "../format.ts";
import type { Kpi } from "./engine.ts";

export const BANK_KPI_KEYS = [
  "minBalance",
  "averageDailyBalance",
  "currentToAverage",
  "daysCashOnHand",
  "operatingCashFlow",
  "netBurn",
  "inflowOutflowRatio",
  "inflowVolatility",
  "receiptsPerMonth",
  "debtServiceBurden",
  "payrollRegularity",
  "returnedItems",
  "overdraftDays",
  "returnedReceiptsRatio",
  "publicInflowShare",
  "internalTransferShare",
] as const;
export type BankKpiKey = (typeof BANK_KPI_KEYS)[number];

export interface BankKpiMovement {
  bookingDate: string;
  amount: number;
  category: BankCategory;
  categoryRule?: string;
}

export interface BankKpiAccount {
  accountMasked: string;
  start: string;
  end: string;
  openingBalance: number;
  transactions: BankKpiMovement[];
  /** Document the file came from (provenance). */
  docId?: string;
  /** false: an Excel/CSV export without running balances (its movements count, its balances are unknown). */
  balancesKnown?: boolean;
}

/** KPIs that need the daily balance: none of them when an account's balances are unknown. */
const BALANCE_KPIS = new Set<BankKpiKey>(["minBalance", "averageDailyBalance", "currentToAverage", "daysCashOnHand", "overdraftDays"]);

export interface BankKpiSet {
  period: { start: string; end: string; days: number; fullMonths: number };
  accounts: number;
  /** Documents behind the figures: `doc:<id>`. */
  sources: string[];
  /** Accounts that do not cover the whole window, worded for the notes. */
  coverageNote: string | null;
  kpis: Kpi[];
}

/** Money that is the business collecting (as in inflowBreakdown: unclassified inflows count, and are reported). */
const RECEIPT = new Set<BankCategory>(["customer_receipt", "other_inflow"]);
/** Money out to run the business: everything but debt, owners, investments and the company's own money moving. */
const OPERATING_OUT = new Set<BankCategory>(["operating_payment", "payroll", "social_security", "tax", "bank_fees", "cash_withdrawal", "other_outflow"]);
const DEBT_OUT = new Set<BankCategory>(["debt_service", "interest"]);
/** Neither in nor out for the business: its own money moving between accounts, and entries cancelled. */
const NEUTRAL = new Set<BankCategory>(["internal_transfer", "reversal"]);
/** Refunds that come from public bodies: tax office and social security. */
const PUBLIC_REFUND_RULES = new Set(["tax_refund", "social_security"]);
/** A direct debit the company paid that came back (often for lack of funds). */
const RETURNED_DEBIT_RULES = new Set(["returned", "aeb:14"]);

const WINDOW_DAYS = 365;
const RECENT_DAYS = 90;
const MIN_DAYS = 28;
const DAYS_PER_MONTH = 365 / 12;

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const monthOf = (n: number) => isoOf(n).slice(0, 7);

interface Segment {
  start: number;
  end: number;
  opening: number;
  /** Net movements by day number. */
  byDay: Map<number, number>;
  moves: Map<number, BankKpiMovement[]>;
}

interface Acct {
  masked: string;
  segments: Segment[];
  first: number;
  last: number;
}

/** Files of the same account (consecutive periods) joined; when two cover a day, the later-starting one decides. */
function groupAccounts(accounts: BankKpiAccount[]): Acct[] {
  const by = new Map<string, Segment[]>();
  for (const a of accounts) {
    const byDay = new Map<number, number>();
    const moves = new Map<number, BankKpiMovement[]>();
    for (const t of a.transactions) {
      const d = dayNum(t.bookingDate);
      byDay.set(d, (byDay.get(d) ?? 0) + t.amount);
      moves.set(d, [...(moves.get(d) ?? []), t]);
    }
    const seg: Segment = { start: dayNum(a.start), end: dayNum(a.end), opening: a.openingBalance, byDay, moves };
    by.set(a.accountMasked, [...(by.get(a.accountMasked) ?? []), seg]);
  }
  return [...by].map(([masked, segments]) => {
    segments.sort((x, y) => x.start - y.start || x.end - y.end);
    return { masked, segments, first: segments[0].start, last: Math.max(...segments.map((s) => s.end)) };
  });
}

const segmentFor = (a: Acct, day: number) => {
  let found: Segment | null = null;
  for (const s of a.segments) if (s.start <= day && day <= s.end) found = s;
  return found;
};

/** Balance at the end of `day` within a segment: opening plus its movements up to that day. */
const balanceIn = (s: Segment, day: number) => {
  let b = s.opening;
  for (const [d, v] of s.byDay) if (d <= day) b += v;
  return b;
};

const nullSet = (start: string, end: string, days: number, accounts: number, sources: string[], note: string): BankKpiSet => ({
  period: { start, end, days, fullMonths: 0 },
  accounts,
  sources,
  coverageNote: null,
  kpis: BANK_KPI_KEYS.map((key) => ({ key, value: null, unit: BANK_KPI_UNIT[key], formula: BANK_KPI_FORMULA[key], inputs: {}, note })),
});

export const BANK_KPI_UNIT: Record<BankKpiKey, Kpi["unit"]> = {
  minBalance: "EUR", averageDailyBalance: "EUR", currentToAverage: "x", daysCashOnHand: "days", operatingCashFlow: "EUR", netBurn: "EUR",
  inflowOutflowRatio: "x", inflowVolatility: "%", receiptsPerMonth: "count", debtServiceBurden: "%", payrollRegularity: "%", returnedItems: "count",
  overdraftDays: "count", returnedReceiptsRatio: "%", publicInflowShare: "%", internalTransferShare: "%",
};

const BANK_KPI_FORMULA: Record<BankKpiKey, string> = {
  minBalance: "mínimo del saldo conjunto al cierre de cada día",
  averageDailyBalance: "Σ saldo conjunto al cierre de cada día / días",
  currentToAverage: "saldo final / saldo medio diario de los últimos 90 días",
  daysCashOnHand: "saldo final / (pagos operativos / días)",
  operatingCashFlow: "(cobros de clientes − recibos devueltos − pagos operativos) / meses",
  netBurn: "media de (pagos operativos − cobros netos) en los meses completos con flujo operativo negativo",
  inflowOutflowRatio: "entradas / salidas de los últimos 90 días, sin traspasos entre cuentas propias ni anulaciones",
  inflowVolatility: "desviación típica / media de los cobros de clientes por mes completo",
  receiptsPerMonth: "número de cobros de clientes / meses",
  debtServiceBurden: "(cuotas de préstamos, leasing y anticipos + intereses) / cobros netos de clientes",
  payrollRegularity: "meses completos con pago de nóminas / meses completos",
  returnedItems: "recibos de clientes devueltos + recibos propios devueltos",
  overdraftDays: "días en que alguna cuenta cierra en descubierto",
  returnedReceiptsRatio: "recibos de clientes devueltos / cobros de clientes identificados",
  publicInflowShare: "devoluciones de Hacienda y Seguridad Social / entradas (sin traspasos ni anulaciones)",
  internalTransferShare: "traspasos entre cuentas propias recibidos / total de entradas",
};

/** Movements and balances over the window → the bank KPIs. `accounts` must already be classified. */
export function computeBankKpis(accounts: BankKpiAccount[]): BankKpiSet | null {
  if (!accounts.length) return null;
  const sources = [...new Set(accounts.flatMap((a) => (a.docId ? [`doc:${a.docId}`] : [])))];
  const accts = groupAccounts(accounts);
  const end = Math.max(...accts.map((a) => a.last));
  const start = Math.max(Math.min(...accts.map((a) => a.first)), end - WINDOW_DAYS + 1);
  const days = end - start + 1;
  if (days < MIN_DAYS) return nullSet(isoOf(start), isoOf(end), Math.max(days, 0), accts.length, sources, `Los extractos cubren ${Math.max(days, 0)} días; hacen falta al menos ${MIN_DAYS}`);

  // Daily combined balance, overdraft days, and the movements that count (each day of each account from one file).
  const balances: number[] = [];
  let overdraftDays = 0;
  const counted: { day: number; t: BankKpiMovement }[] = [];
  const partial: string[] = [];
  for (const a of accts) {
    if (a.first > start || a.last < end || a.segments.some((s, i) => i > 0 && s.start > Math.max(...a.segments.slice(0, i).map((p) => p.end)) + 1)) {
      partial.push(`${a.masked} (${formatDate(isoOf(Math.max(a.first, start)))} – ${formatDate(isoOf(Math.min(a.last, end)))})`);
    }
  }
  const state = accts.map(() => ({ seg: null as Segment | null, bal: 0 }));
  for (let d = start; d <= end; d++) {
    let total = 0;
    let overdrawn = false;
    accts.forEach((a, i) => {
      const s = segmentFor(a, d);
      const st = state[i];
      if (s) {
        st.bal = st.seg === s ? st.bal + (s.byDay.get(d) ?? 0) : balanceIn(s, d);
        st.seg = s;
        for (const t of s.moves.get(d) ?? []) counted.push({ day: d, t });
        if (st.bal < -0.005) overdrawn = true;
      } else {
        // Before its first file: the opening balance; after a file ends (or in a gap): that file's closing balance.
        const prev = [...a.segments].filter((x) => x.end < d).at(-1);
        st.bal = prev ? balanceIn(prev, prev.end) : a.segments[0].opening;
        st.seg = null;
      }
      total += st.bal;
    });
    balances.push(total);
    if (overdrawn) overdraftDays++;
  }

  const months = days / DAYS_PER_MONTH;
  const closing = balances.at(-1)!;
  const recent = balances.slice(-RECENT_DAYS);
  const recentFrom = end - recent.length + 1;

  // Flow totals.
  let receipts = 0, identified = 0, returned = 0, returnedCount = 0, returnedDebits = 0, receiptCount = 0;
  let opOut = 0, debtService = 0, interest = 0, payroll = 0;
  let inflows = 0, grossInflows = 0, internalIn = 0, publicIn = 0;
  let in90 = 0, out90 = 0;
  const monthly = new Map<string, { receipts: number; opOut: number; payroll: number }>();
  const m = (day: number) => {
    const k = monthOf(day);
    if (!monthly.has(k)) monthly.set(k, { receipts: 0, opOut: 0, payroll: 0 });
    return monthly.get(k)!;
  };
  for (const { day, t } of counted) {
    const amt = Math.abs(t.amount);
    const mm = m(day);
    if (day >= recentFrom && !NEUTRAL.has(t.category)) {
      if (t.amount > 0) in90 += amt;
      else out90 += amt;
    }
    if (t.amount > 0) {
      grossInflows += amt;
      if (t.category === "internal_transfer") internalIn += amt;
      if (!NEUTRAL.has(t.category)) inflows += amt;
      if (RECEIPT.has(t.category)) {
        receipts += amt;
        receiptCount++;
        mm.receipts += amt;
        if (t.category === "customer_receipt") identified += amt;
      }
      if (t.category === "refund" && PUBLIC_REFUND_RULES.has(t.categoryRule ?? "")) publicIn += amt;
      if (t.category === "refund" && RETURNED_DEBIT_RULES.has(t.categoryRule ?? "")) returnedDebits++;
    } else if (t.amount < 0) {
      if (t.category === "customer_return") {
        returned += amt;
        returnedCount++;
        mm.receipts -= amt;
      }
      if (OPERATING_OUT.has(t.category)) {
        opOut += amt;
        mm.opOut += amt;
      }
      if (t.category === "payroll") {
        payroll += amt;
        mm.payroll += amt;
      }
      if (t.category === "debt_service") debtService += amt;
      if (t.category === "interest") interest += amt;
    }
  }
  const netReceipts = receipts - returned;

  // Calendar months fully inside the window.
  const full: string[] = [];
  for (const k of new Set(Array.from({ length: days }, (_, i) => monthOf(start + i)))) {
    const first = dayNum(`${k}-01`);
    const next = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 1)).getTime() / 86_400_000;
    if (first >= start && next - 1 <= end) full.push(k);
  }
  const fm = full.map((k) => monthly.get(k) ?? { receipts: 0, opOut: 0, payroll: 0 });

  const coverageNote = partial.length ? `Cuentas que no cubren todo el periodo (fuera de él se toma su saldo inicial o final, sin movimientos): ${partial.join(", ")}` : null;
  const period = `Extractos del ${formatDate(isoOf(start))} al ${formatDate(isoOf(end))}`;
  const join = (...n: (string | null | undefined)[]) => n.filter(Boolean).join(". ") || undefined;
  const kpis: Kpi[] = [];
  const add = (key: BankKpiKey, value: number | null, inputs: Record<string, number>, note?: string | null, withCoverage = true) =>
    kpis.push({ key, value, unit: BANK_KPI_UNIT[key], formula: BANK_KPI_FORMULA[key], inputs, note: join(note, withCoverage ? coverageNote : null) });

  const minIdx = balances.reduce((best, b, i) => (b < balances[best] ? i : best), 0);
  add("minBalance", r(balances[minIdx]), { accounts: accts.length, days }, `${period}. Mínimo el ${formatDate(isoOf(start + minIdx))}`);
  const adb = balances.reduce((s, b) => s + b, 0) / days;
  add("averageDailyBalance", r(adb), { accounts: accts.length, days }, period);
  const adb90 = recent.reduce((s, b) => s + b, 0) / recent.length;
  add("currentToAverage", adb90 > 0 ? r(closing / adb90) : null, { closingBalance: r(closing), averageBalance90d: r(adb90), recentDays: recent.length }, adb90 > 0 ? (recent.length < RECENT_DAYS ? `Media de ${recent.length} días` : null) : "Saldo medio no positivo; ratio no significativo");
  const dailyOut = opOut / days;
  add(
    "daysCashOnHand",
    dailyOut > 0 ? (closing > 0 ? r(closing / dailyOut, 0) : 0) : null,
    { closingBalance: r(closing), operatingOutflows: r(opOut), days },
    dailyOut > 0 ? (closing > 0 ? null : "Saldo final nulo o negativo") : "Sin pagos operativos en el periodo",
  );
  add("operatingCashFlow", r((netReceipts - opOut) / months), { receipts: r(receipts), returnedReceipts: r(returned), operatingOutflows: r(opOut), months: r(months, 1) }, join(period, "Media mensual; sin financiación, deuda, socios ni inversiones"));

  const burn = fm.map((x) => x.opOut - x.receipts).filter((x) => x > 0);
  add(
    "netBurn",
    fm.length ? (burn.length ? r(burn.reduce((s, x) => s + x, 0) / burn.length) : 0) : null,
    { burnMonths: burn.length, fullMonths: fm.length },
    fm.length ? (burn.length ? null : "Ningún mes completo con flujo operativo negativo") : "Sin meses completos en el periodo",
  );
  add("inflowOutflowRatio", out90 > 0 ? r(in90 / out90) : null, { inflows90d: r(in90), outflows90d: r(out90), recentDays: recent.length }, out90 > 0 ? null : "Sin salidas en los últimos 90 días");

  if (fm.length >= 3) {
    const mean = fm.reduce((s, x) => s + x.receipts, 0) / fm.length;
    const sd = Math.sqrt(fm.reduce((s, x) => s + (x.receipts - mean) ** 2, 0) / fm.length);
    add("inflowVolatility", mean > 0 ? r((sd / mean) * 100, 1) : null, { fullMonths: fm.length, meanMonthlyReceipts: r(mean), stdDevMonthlyReceipts: r(sd) }, mean > 0 ? null : "Sin cobros de clientes en los meses completos");
  } else {
    add("inflowVolatility", null, { fullMonths: fm.length }, "Hacen falta al menos 3 meses completos");
  }
  add("receiptsPerMonth", r(receiptCount / months, 1), { receiptCount, months: r(months, 1) }, "Cobros de clientes identificados y entradas sin clasificar");
  add("debtServiceBurden", netReceipts > 0 ? r(((debtService + interest) / netReceipts) * 100, 1) : null, { debtService: r(debtService), interestPaid: r(interest), netReceipts: r(netReceipts) }, netReceipts > 0 ? null : "Sin cobros netos de clientes");

  const payrollMonths = fm.filter((x) => x.payroll > 0).length;
  add(
    "payrollRegularity",
    fm.length ? r((payrollMonths / fm.length) * 100, 0) : null,
    { monthsWithPayroll: payrollMonths, fullMonths: fm.length, payrollTotal: r(payroll) },
    !fm.length ? "Sin meses completos en el periodo" : payroll === 0 ? "No hay pagos de nóminas identificados: puede pagarlas desde otra cuenta o no tener empleados" : null,
  );
  add("returnedItems", returnedCount + returnedDebits, { returnedReceiptCount: returnedCount, returnedDebitCount: returnedDebits }, "Recibos de clientes que vuelven impagados y recibos de la empresa que el banco devuelve");
  add("overdraftDays", overdraftDays, { days, accounts: accts.length }, period);
  add("returnedReceiptsRatio", identified > 0 ? r((returned / identified) * 100, 1) : null, { returnedReceipts: r(returned), identifiedReceipts: r(identified) }, identified > 0 ? null : "Sin cobros de clientes identificados");
  add("publicInflowShare", inflows > 0 ? r((publicIn / inflows) * 100, 1) : null, { publicRefunds: r(publicIn), bankInflows: r(inflows) }, "Devoluciones de IVA, otros impuestos y Seguridad Social: no son ventas y no se repiten cada mes");
  add("internalTransferShare", grossInflows > 0 ? r((internalIn / grossInflows) * 100, 1) : null, { internalTransfers: r(internalIn), totalInflows: r(grossInflows) }, "Dinero de la propia empresa que llega desde otra de sus cuentas");

  // An account without balances (opening 0 as a placeholder) would make every balance figure wrong: leave them out.
  const unknown = [...new Set(accounts.filter((a) => a.balancesKnown === false).map((a) => a.accountMasked))];
  const result = unknown.length
    ? kpis.map((k) => (BALANCE_KPIS.has(k.key as BankKpiKey) ? { ...k, value: null, inputs: {}, note: `Sin saldos: ${unknown.join(", ")} no trae saldo en el extracto, así que no se puede calcular el saldo diario` } : k))
    : kpis;
  return { period: { start: isoOf(start), end: isoOf(end), days, fullMonths: fm.length }, accounts: accts.length, sources, coverageNote, kpis: result };
}
