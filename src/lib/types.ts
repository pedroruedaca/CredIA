/** Shared domain types. Pure TS (no runtime deps) so every engine module stays testable in isolation. */

export type PeriodKind = "closed_fy" | "ytd";

export interface Period {
  kind: PeriodKind;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/** One account's movements over a period. Same shape whether it came from an upload or from Holded. */
export interface LedgerBalance {
  account: string; // original code, e.g. "43000012"
  pgc3: string; // 3-digit PGC rollup, e.g. "430"
  name?: string;
  debit: number;
  credit: number;
  source: "upload" | "holded";
  sourceRef: string; // e.g. "doc:<uuid>:row:42" or "holded:ledger:2024-01-01..2024-12-31:acct:43000012"
}

export interface Warning {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface Result<T> {
  data: T;
  warnings: Warning[];
}

/** Parse Holded / spreadsheet decimal strings ("1.234,56", "1234.56", "-12") into euros. */
export function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  let s = v.trim().replace(/\s|€/g, "");
  if (s === "") return 0;
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", "."); // Spanish format
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/** Calendar months covered by [start, end] inclusive. 2026-01-01..2026-06-30 → 6; ..2026-09-28 → 8.93. */
export function monthsBetween(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  const daysInEndMonth = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  const months = (y2 - y1) * 12 + (m2 - m1) + (d2 - (d1 - 1)) / daysInEndMonth;
  return Math.max(0.5, Math.round(months * 100) / 100);
}
