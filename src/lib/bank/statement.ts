/**
 * Bank statements that are not Norma 43 (Excel/CSV exports, PDF statements) → the same N43Account shape, so the
 * classifier, the bank KPIs and the checks treat them alike. Pure.
 *
 * The rule for every format: a statement is only used if it adds up. Movements are put in date order (statements
 * print newest or oldest first), the opening balance is the printed one or the first running balance minus its
 * movement, and every printed running balance must equal the opening plus the movements up to that line; the closing
 * balance too. A file without running balances gives flows but no balances (balancesKnown: false).
 */
import type { N43Account, N43Transaction } from "../parsers/norma43.ts";
import type { Warning } from "../types.ts";

/** One movement as printed, in the statement's own order. */
export interface StatementRow {
  date: string; // YYYY-MM-DD
  valueDate?: string | null;
  description: string;
  amount: number; // + in, − out
  balance: number | null; // running balance printed on the line, if any
  sourceRef: string;
}

export interface Reconciled {
  /** Movements in date order (same-day movements keep the statement's sequence). */
  rows: StatementRow[];
  opening: number | null;
  closing: number | null;
  order: "ascending" | "descending";
  /** Lines whose printed balance does not follow from the previous one. */
  mismatches: { sourceRef: string; expected: number; printed: number }[];
  /** Printed closing balance that does not equal opening + movements. */
  closingMismatch: { expected: number; printed: number } | null;
  balancesKnown: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.015;

/**
 * Puts the rows in date order and checks them. Order comes from the running balances when there are any (each
 * balance follows from the line before it, top to bottom or bottom to top), else from the dates.
 */
export function reconcileRows(printed: StatementRow[], opts: { opening?: number | null; closing?: number | null } = {}): Reconciled {
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < printed.length; i++) {
    const [p, c] = [printed[i - 1], printed[i]];
    if (p.balance === null || c.balance === null) continue;
    if (near(c.balance, p.balance + c.amount)) asc++;
    if (near(p.balance, c.balance + p.amount)) desc++;
  }
  const byDates = printed.length > 1 && printed[0].date > printed[printed.length - 1].date ? "descending" : "ascending";
  const order: Reconciled["order"] = asc === desc ? byDates : asc > desc ? "ascending" : "descending";
  const rows = order === "ascending" ? [...printed] : [...printed].reverse();
  // Stable by date: a statement out of date order (value-date sorting) keeps its sequence within a day.
  const indexed = rows.map((row, i) => ({ row, i }));
  indexed.sort((a, b) => a.row.date.localeCompare(b.row.date) || a.i - b.i);
  const sorted = indexed.map((x) => x.row);

  // Opening: printed, else the first running balance minus the movements up to and including its line.
  const fwb = rows.findIndex((x) => x.balance !== null);
  const opening = opts.opening ?? (fwb >= 0 ? r2(rows[fwb].balance! - rows.slice(0, fwb + 1).reduce((s, x) => s + x.amount, 0)) : null);
  const balancesKnown = opening !== null;

  // Running balance along the statement's own sequence (the order the bank computed it in).
  const mismatches: Reconciled["mismatches"] = [];
  let running = opening;
  for (const row of rows) {
    if (running === null) break;
    running = r2(running + row.amount);
    if (row.balance !== null && !near(running, row.balance)) {
      mismatches.push({ sourceRef: row.sourceRef, expected: running, printed: row.balance });
      running = row.balance; // one misread line is reported once, not on every line after it
    }
  }
  const computedClosing = opening === null ? null : r2(opening + rows.reduce((s, x) => s + x.amount, 0));
  const lastBalance = [...rows].reverse().find((x) => x.balance !== null)?.balance ?? null;
  const printedClosing = opts.closing ?? null;
  const closingMismatch = printedClosing !== null && computedClosing !== null && !near(printedClosing, computedClosing) ? { expected: computedClosing, printed: printedClosing } : null;
  return { rows: sorted, opening, closing: printedClosing ?? computedClosing ?? lastBalance, order, mismatches, closingMismatch, balancesKnown };
}

/** Whether a reconciled statement adds up. */
export const addsUp = (r: Reconciled) => r.mismatches.length === 0 && r.closingMismatch === null;

// ---------------------------------------------------------------------------------------------------------------
// Accounts

/** "ES91 2100 0418 4502 0005 1332" (any spacing) → its parts; null when it is not a Spanish IBAN. */
export function parseIban(text: string | null | undefined): { iban: string; bank: string; branch: string; account: string } | null {
  const m = /ES\s?\d{2}(?:[\s-]?\d){20}/i.exec(text ?? "");
  if (!m) return null;
  const digits = m[0].replace(/[^\d]/g, "");
  if (digits.length !== 22) return null;
  return { iban: `ES${digits}`, bank: digits.slice(2, 6), branch: digits.slice(6, 10), account: digits.slice(12, 22) };
}

/** Same masking as the Norma 43 parser, so a bank's PDF and its Norma 43 file are the same account. */
export const maskAccount = (bank: string, branch: string, account: string) => `${bank} ${branch} ****${account.slice(-4)}`;

/** An account built from a statement's movements, in the shape the Norma 43 parser gives. */
export function toN43Account(input: {
  iban: string | null;
  holder: string;
  currency?: string;
  label: string;
  rec: Reconciled;
  start?: string | null;
  end?: string | null;
}): N43Account & { balancesKnown: boolean } {
  const p = parseIban(input.iban);
  const dates = input.rec.rows.map((x) => x.date).sort();
  const debits = input.rec.rows.filter((x) => x.amount < 0);
  const credits = input.rec.rows.filter((x) => x.amount > 0);
  const transactions: N43Transaction[] = input.rec.rows.map((x) => ({
    bookingDate: x.date,
    valueDate: x.valueDate ?? x.date,
    amount: x.amount,
    commonConcept: "",
    ownConcept: "",
    document: "",
    reference1: "",
    reference2: "",
    description: x.description,
    category: x.amount >= 0 ? "other_inflow" : "other_outflow", // classified with the rest of the case
    sourceRef: x.sourceRef,
  }));
  return {
    bank: p?.bank ?? "",
    branch: p?.branch ?? "",
    // Without an IBAN the account is named by the file, so two files never merge by accident.
    accountMasked: p ? maskAccount(p.bank, p.branch, p.account) : input.label,
    currency: input.currency === "EUR" || !input.currency ? "978" : input.currency,
    start: input.start ?? dates[0] ?? "",
    end: input.end ?? dates[dates.length - 1] ?? "",
    name: input.holder,
    openingBalance: input.rec.opening ?? 0,
    closingBalance: input.rec.closing,
    totals: { debits: r2(-debits.reduce((s, x) => s + x.amount, 0)), credits: r2(credits.reduce((s, x) => s + x.amount, 0)), debitCount: debits.length, creditCount: credits.length },
    transactions,
    balancesKnown: input.rec.balancesKnown,
  };
}

/** Warnings for a statement that does not add up, worded for the lender. */
export function reconciliationWarnings(label: string, r: Reconciled): Warning[] {
  const w: Warning[] = [];
  if (r.mismatches.length) {
    w.push({
      code: "statement_balance_mismatch",
      message: `${label}: ${r.mismatches.length === 1 ? "una línea no cuadra" : `${r.mismatches.length} líneas no cuadran`} con el saldo anterior y su importe.`,
      detail: { lines: r.mismatches.slice(0, 10) },
    });
  }
  if (r.closingMismatch) {
    w.push({ code: "statement_closing_mismatch", message: `${label}: el saldo final no es el inicial más los movimientos.`, detail: r.closingMismatch });
  }
  if (!r.balancesKnown) {
    w.push({ code: "statement_no_balances", message: `${label}: el extracto no trae saldos; se usan los movimientos, pero no los indicadores de saldo.` });
  }
  return w;
}

// ---------------------------------------------------------------------------------------------------------------
// Cell values

/** Spanish amounts as banks print them: "1.234,56", "-1.234,56 €", "1234.56", "(12,00)", numbers. null when empty or not a number. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? r2(v) : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s|€|EUR/gi, "");
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) [s, sign] = [s.slice(1, -1), -1];
  if (s.endsWith("-")) [s, sign] = [s.slice(0, -1), -sign];
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) [s, sign] = [s.slice(1), -sign];
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.500" is fifteen hundred
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? r2(sign * n) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Dates as banks write them: Date cells, Excel serial numbers, "31/12/2025", "31-12-25", "2025-12-31". */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}
