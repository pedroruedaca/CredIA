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
