/**
 * In-memory fake of the Holded v2 API (accounting endpoints) for tests.
 * Supports date filtering, cursor pagination, auth/scope failures and 429 injection.
 */
import type { HoldedLedgerLine } from "../connectors/holded.ts";
import { tbSmallSl } from "./tb-small-sl.ts";

export const VALID_KEY = "test_key_1234567890abcdef";

export interface FakeOptions {
  lines: HoldedLedgerLine[];
  scopes?: string[];
  rateLimitFirst?: number; // respond 429 to the first N requests
}

export function fakeHoldedFetch(opts: FakeOptions) {
  const scopes = new Set(opts.scopes ?? ["accounting:chart-of-accounts.read", "accounting:daily-ledger.read"]);
  let rl = opts.rateLimitFirst ?? 0;
  const calls: string[] = [];
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${VALID_KEY}`) return json({ error: "unauthorized" }, 401);
    if (rl > 0) { rl--; return json({ error: "rate" }, 429, { "retry-after": "1" }); }

    if (url.pathname === "/api/v2/accounting-accounts") {
      if (!scopes.has("accounting:chart-of-accounts.read")) return json({ error: "forbidden" }, 403);
      return json({ items: [] });
    }
    if (url.pathname === "/api/v2/ledger-entries") {
      if (!scopes.has("accounting:daily-ledger.read")) return json({ error: "forbidden" }, 403);
      const start = url.searchParams.get("start_date");
      const end = url.searchParams.get("end_date");
      if (!start || !end) return json({ error: "start_date and end_date required" }, 400);
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      const filtered = opts.lines.filter((l) => l.date >= start && l.date <= end);
      const items = filtered.slice(offset, offset + limit);
      const has_more = offset + limit < filtered.length;
      return json({ items, cursor: has_more ? String(offset + limit) : null, has_more });
    }
    return json({ error: "not found" }, 404);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

// ---------------------------------------------------------------- ledger builders

let seq = 0;
const line = (entry: number, date: string, account: string, debit: number, credit: number, description: string, type: string | null = null): HoldedLedgerLine => ({
  entry_number: entry, line: ++seq, date, type, description, doc_description: null,
  account: Number(account), debit: debit.toFixed(2), credit: credit.toFixed(2), tags: [], checked: false,
});

const isPnl = (a: string) => a[0] === "6" || a[0] === "7";

/**
 * FY2025 books matching tbSmallSl, with explicit opening, regularisation and closing entries.
 * `labelled`: entries carry Holded-style type/description; otherwise they must be detected structurally.
 */
export function fy2025Ledger({ labelled }: { labelled: boolean }): HoldedLedgerLine[] {
  const out: HoldedLedgerLine[] = [];
  // 1. Opening (prior-year balances): capital, reserves vs bank.
  out.push(
    line(1, "2025-01-01", "10000000", 0, 60_000, labelled ? "Asiento de apertura" : "Asiento 1", labelled ? "opening" : null),
    line(1, "2025-01-01", "11300000", 0, 90_000, labelled ? "Asiento de apertura" : "Asiento 1", labelled ? "opening" : null),
    line(1, "2025-01-01", "57200001", 150_000, 0, labelled ? "Asiento de apertura" : "Asiento 1", labelled ? "opening" : null),
  );
  // 2. The year's activity: every fixture balance except capital/reserves, bank reduced by the opening.
  let n = 2;
  for (const b of tbSmallSl) {
    if (b.account === "10000000" || b.account === "11300000") continue;
    const debit = b.account === "57200001" ? b.debit - 150_000 : b.debit;
    // Split into two entries on different dates to exercise pagination and grouping.
    out.push(line(n, "2025-06-30", b.account, debit / 2, b.credit / 2, `Operaciones ${b.name}`));
    out.push(line(n + 1, "2025-11-30", b.account, debit / 2, b.credit / 2, `Operaciones ${b.name}`));
  }
  n += 2;
  // 3. Regularisation: close 6/7 into 129.
  let result = 0;
  for (const b of tbSmallSl.filter((x) => isPnl(x.account))) {
    const net = b.debit - b.credit;
    result -= net;
    out.push(line(n, "2025-12-31", b.account, net < 0 ? -net : 0, net > 0 ? net : 0, labelled ? "Regularización" : `Asiento ${n}`));
  }
  out.push(line(n, "2025-12-31", "12900000", result < 0 ? -result : 0, result > 0 ? result : 0, labelled ? "Regularización" : `Asiento ${n}`));
  n++;
  // 4. Closing: zero every balance-sheet account (incl. 129).
  const bsFinal = new Map<string, number>();
  for (const l of out) {
    const a = String(l.account);
    if (isPnl(a)) continue;
    bsFinal.set(a, (bsFinal.get(a) ?? 0) + Number(l.debit) - Number(l.credit));
  }
  for (const [a, net] of bsFinal) {
    if (Math.abs(net) < 0.005) continue;
    out.push(line(n, "2025-12-31", a, net < 0 ? -net : 0, net > 0 ? net : 0, labelled ? "Asiento de cierre" : `Asiento ${n}`, labelled ? "closing" : null));
  }
  return out;
}

/** FY2026 activity with NO opening entry (company never ran year-close in Holded). */
export function ytd2026LedgerWithoutOpening(): HoldedLedgerLine[] {
  return [
    line(1, "2026-03-15", "43000001", 60_500, 0, "Factura 2026/001"),
    line(1, "2026-03-15", "70000000", 0, 50_000, "Factura 2026/001"),
    line(1, "2026-03-15", "47700000", 0, 10_500, "Factura 2026/001"),
    line(2, "2026-04-10", "57200001", 60_500, 0, "Cobro 2026/001"),
    line(2, "2026-04-10", "43000001", 0, 60_500, "Cobro 2026/001"),
  ];
}
