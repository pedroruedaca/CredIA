/**
 * Modelo 303 (IVA, autoliquidación): which periods a return covers and which quarters a case still lacks. Pure.
 * The lender asks for the last 4 quarters filed. Large companies (SII, REDEME) file monthly; three monthly returns
 * cover a quarter.
 */

/** Period box of the return: "1T".."4T" (quarterly) or "01".."12" (monthly). */
export const M303_PERIODS = ["1T", "2T", "3T", "4T", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;
export type M303Period = (typeof M303_PERIODS)[number];

export interface Quarter {
  year: number;
  q: 1 | 2 | 3 | 4;
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** First and last day covered by a return for `year` and `period`. */
export function periodRange(year: number, period: M303Period): { start: string; end: string } {
  const [m1, m2] = period.endsWith("T") ? [(Number(period[0]) - 1) * 3 + 1, Number(period[0]) * 3] : [Number(period), Number(period)];
  return { start: `${year}-${pad(m1)}-01`, end: `${year}-${pad(m2)}-${pad(lastDay(year, m2))}` };
}

export function quarter(year: number, q: 1 | 2 | 3 | 4): Quarter {
  return { year, q, ...periodRange(year, `${q}T` as M303Period) };
}

/** "2T 26". */
export const quarterLabel = (q: Pick<Quarter, "year" | "q">) => `${q.q}T ${String(q.year).slice(2)}`;

/**
 * Filing deadline of a quarterly return: the 20th of the following month, the 30th of January for the fourth quarter.
 * (Holiday shifts are ignored: a day either way does not change which quarters to ask for.)
 */
export function filingDeadline(q: Pick<Quarter, "year" | "q">): string {
  return q.q === 4 ? `${q.year + 1}-01-30` : `${q.year}-${pad(q.q * 3 + 1)}-20`;
}

/** The last `n` quarters whose filing deadline has passed by `today` (YYYY-MM-DD), oldest first. */
export function expectedQuarters(today: string, n = 4): Quarter[] {
  let year = Number(today.slice(0, 4));
  let q = (Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4;
  const back = () => {
    q = (q === 1 ? 4 : q - 1) as 1 | 2 | 3 | 4;
    if (q === 4) year--;
  };
  back(); // the current quarter is never filed yet
  while (filingDeadline({ year, q }) >= today) back();
  const out: Quarter[] = [];
  for (let i = 0; i < n; i++, back()) out.unshift(quarter(year, q));
  return out;
}

/** Expected quarters covered by the returns received (by date range), and those still missing. */
export function quarterCoverage(returns: { start: string; end: string }[], expected: Quarter[]): { covered: Quarter[]; missing: Quarter[] } {
  const months = new Set<string>();
  for (const r of returns) {
    for (let y = +r.start.slice(0, 4), m = +r.start.slice(5, 7); `${y}-${pad(m)}` <= r.end.slice(0, 7); m === 12 ? (y++, (m = 1)) : m++) {
      months.add(`${y}-${pad(m)}`);
    }
  }
  const has = (q: Quarter) => [0, 1, 2].every((i) => months.has(`${q.year}-${pad((q.q - 1) * 3 + 1 + i)}`));
  return { covered: expected.filter(has), missing: expected.filter((q) => !has(q)) };
}

/**
 * Sales declared in one return: the accrued bases of the régimen general plus the sales that carry no Spanish VAT
 * (entregas intracomunitarias, exportaciones, no sujetas por localización, inversión del sujeto pasivo). Close to the
 * cifra de negocios, but it also includes sales of fixed assets and leaves out exempt operations.
 */
export function declaredSales(r: {
  accruedBase: number;
  intraEuSupplies: number | null;
  exports: number | null;
  notSubjectLocation?: number | null;
  reverseChargeSupplies?: number | null;
}): number {
  const v = r.accruedBase + (r.intraEuSupplies ?? 0) + (r.exports ?? 0) + (r.notSubjectLocation ?? 0) + (r.reverseChargeSupplies ?? 0);
  return Math.round(v * 100) / 100;
}

export interface M303Return {
  docId: string;
  uploadedAt: string;
  data: { fiscalYear: number; period: string; periodStart: string; periodEnd: string; page: number | null } & Parameters<typeof declaredSales>[0];
}

const monthsOf = (start: string, end: string) => {
  const out: string[] = [];
  for (let y = +start.slice(0, 4), m = +start.slice(5, 7); `${y}-${pad(m)}` <= end.slice(0, 7); m === 12 ? (y++, (m = 1)) : m++) out.push(`${y}-${pad(m)}`);
  return out;
};

/**
 * The returns to count for a period: inside it, newest upload per period (a complementaria replaces the original),
 * quarterly before monthly, and never two returns for the same month. `complete` when every month is covered.
 */
export function returnsForPeriod(returns: M303Return[], start: string, end: string): { used: M303Return[]; complete: boolean } {
  const latest = new Map<string, M303Return>();
  for (const r of [...returns].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) latest.set(`${r.data.fiscalYear}-${r.data.period}`, r);
  const inside = [...latest.values()]
    .filter((r) => r.data.periodStart >= start && r.data.periodEnd <= end)
    .sort((a, b) => Number(b.data.period.endsWith("T")) - Number(a.data.period.endsWith("T")) || a.data.periodStart.localeCompare(b.data.periodStart));
  const counted = new Set<string>();
  const used: M303Return[] = [];
  for (const r of inside) {
    const months = monthsOf(r.data.periodStart, r.data.periodEnd);
    if (months.some((m) => counted.has(m))) continue;
    months.forEach((m) => counted.add(m));
    used.push(r);
  }
  used.sort((a, b) => a.data.periodStart.localeCompare(b.data.periodStart));
  return { used, complete: monthsOf(start, end).every((m) => counted.has(m)) };
}

/** Label of a return's period: "2T 26" or "02/26". */
export const returnLabel = (d: { fiscalYear: number; period: string }) =>
  d.period.endsWith("T") ? `${d.period} ${String(d.fiscalYear).slice(2)}` : `${d.period}/${String(d.fiscalYear).slice(2)}`;

/**
 * Year-to-date period the returns cover without gaps from the fiscal year start (`fyStart`), up to the last full
 * month covered; null if they do not cover at least one quarter.
 */
export function coveredYtdEnd(returns: M303Return[], fyStart: string): string | null {
  const months = new Set(returnsForPeriod(returns, fyStart, "9999-12-31").used.flatMap((r) => monthsOf(r.data.periodStart, r.data.periodEnd)));
  let y = +fyStart.slice(0, 4);
  let m = +fyStart.slice(5, 7);
  let n = 0;
  while (months.has(`${y}-${pad(m)}`)) {
    n++;
    if (m === 12) (y++, (m = 1));
    else m++;
  }
  if (n < 3) return null;
  // Last day of the month before (y, m).
  const [ly, lm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}`;
}
