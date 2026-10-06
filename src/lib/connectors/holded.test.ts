import { describe, it, expect } from "vitest";
import { HoldedClient, HoldedError, verifyHoldedKey, pullHoldedTrialBalance } from "./holded.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { computeKpis } from "../kpis/engine.ts";
import { fakeHoldedFetch, fy2025Ledger, ytd2026LedgerWithoutOpening, VALID_KEY } from "../__fixtures__/holded-fake.ts";

const noSleep = async () => {};
const FY2025 = { kind: "closed_fy" as const, start: "2025-01-01", end: "2025-12-31" };

function client(opts: Parameters<typeof fakeHoldedFetch>[0], key = VALID_KEY) {
  const fake = fakeHoldedFetch(opts);
  return { c: new HoldedClient(key, { fetch: fake.fetch, sleep: noSleep }), calls: fake.calls };
}

describe("key verification", () => {
  it("accepts a key with both scopes", async () => {
    const { c } = client({ lines: [] });
    expect((await verifyHoldedKey(c, "2026-09-28")).ok).toBe(true);
  });

  it("reports an invalid key", async () => {
    const { c } = client({ lines: [] }, "wrong_key_000000000000");
    const r = await verifyHoldedKey(c, "2026-09-28");
    expect(r.invalidKey).toBe(true);
  });

  it("names the missing permission in Spanish", async () => {
    const { c } = client({ lines: [], scopes: ["accounting:chart-of-accounts.read"] });
    const r = await verifyHoldedKey(c, "2026-09-28");
    expect(r.ok).toBe(false);
    expect(r.missingScopes).toEqual(["accounting:daily-ledger.read"]);
    expect(r.message).toContain("Libro diario");
  });

  it("rejects obviously truncated keys without calling Holded", () => {
    expect(() => new HoldedClient("abc")).toThrow(HoldedError);
  });

  it("never puts the key in error messages", async () => {
    const { c } = client({ lines: [] }, "wrong_key_000000000000");
    try { await c.listAccounts(); } catch (e) {
      expect(String((e as Error).message)).not.toContain("wrong_key");
    }
  });
});

describe("HTTP behaviour", () => {
  it("paginates with the cursor until has_more is false", async () => {
    const lines = fy2025Ledger({ labelled: true });
    const { c, calls } = client({ lines });
    const got = [];
    for await (const l of c.ledgerLines({ startDate: "2025-01-01", endDate: "2025-12-31", limit: 10 })) got.push(l);
    expect(got).toHaveLength(lines.length);
    expect(calls.length).toBe(Math.ceil(lines.length / 10));
    expect(calls[1]).toContain("cursor=10");
  });

  it("retries on 429", async () => {
    const { c, calls } = client({ lines: [], rateLimitFirst: 2 });
    await c.listAccounts();
    expect(calls.length).toBe(3);
  });
});

describe("pullHoldedTrialBalance → statement", () => {
  for (const labelled of [true, false]) {
    it(`reproduces the pre-closing TB for a closed year (${labelled ? "labelled" : "structural"} detection)`, async () => {
      const { c } = client({ lines: fy2025Ledger({ labelled }) });
      const { data: tb, warnings } = await pullHoldedTrialBalance(c, FY2025);
      expect(tb.excluded.map((e) => e.kind).sort()).toEqual(["closing", "regularisation"]);
      expect(warnings.find((w) => w.code === "holded_closing_entries_suspected")).toBeUndefined();
      expect(warnings.find((w) => w.code === "holded_tb_unbalanced")).toBeUndefined();

      const { data: s } = buildStatement(tb.balances, FY2025);
      expect(s.balanceSheet.imbalance).toBe(0);
      expect(s.balanceSheet.assets.total).toBe(519_000);
      expect(s.incomeStatement.revenue).toBe(1_000_000);
      expect(s.incomeStatement.ebitda).toBe(110_000);
      expect(s.balanceSheet.equityAndLiabilities.equity).toBe(221_000);
      expect(s.lineage.revenue![0].sourceRef).toBe("holded:ledger:2025-01-01..2025-12-31:acct:70000000");

      const dscr = computeKpis(s).find((k) => k.key === "dscr")!;
      expect(dscr.value).toBe(1.59);
    });
  }

  it("reconstructs opening balances when the year was never closed in Holded", async () => {
    const lines = [...fy2025Ledger({ labelled: true }), ...ytd2026LedgerWithoutOpening()];
    const { c } = client({ lines });
    const period = { kind: "ytd" as const, start: "2026-01-01", end: "2026-09-28" };
    const { data: tb, warnings } = await pullHoldedTrialBalance(c, period, { booksStart: "2020-01-01" });
    expect(tb.openingReconstructed).toBe(true);
    expect(warnings.some((w) => w.code === "holded_opening_reconstructed")).toBe(true);

    const { data: s } = buildStatement(tb.balances, period);
    expect(s.balanceSheet.imbalance).toBe(0);
    // capital 60k + reserves 90k + 2025 result in 129 (71k) + 2026 YTD result (50k)
    expect(s.balanceSheet.equityAndLiabilities.equity).toBe(271_000);
    expect(s.balanceSheet.assets.cash).toBe(174_000 + 60_500);
    expect(s.incomeStatement.revenue).toBe(50_000);
    expect(s.months).toBeCloseTo(8.93, 2);
  });
});

import { runHoldedSync, periodsFor } from "./holded-sync.ts";

describe("runHoldedSync", () => {
  it("derives closed FY and YTD periods", () => {
    expect(periodsFor("2025-12-31", "2026-09-28")).toEqual([
      { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" },
      { kind: "ytd", start: "2026-01-01", end: "2026-09-28" },
    ]);
    expect(periodsFor("2025-12-31", "2026-01-10")).toHaveLength(1);
  });

  it("produces statements and KPIs for both periods", async () => {
    const { c } = client({ lines: [...fy2025Ledger({ labelled: false }), ...ytd2026LedgerWithoutOpening()] });
    const r = await runHoldedSync(c, { fiscalYearEnd: "2025-12-31", today: "2026-09-28" });
    expect(r.periods.map((p) => p.period.kind)).toEqual(["closed_fy", "ytd"]);
    expect(r.periods[0].statement.incomeStatement.ebitda).toBe(110_000);
    expect(r.periods[1].statement.balanceSheet.imbalance).toBe(0);
    const { UNIT } = await import("../kpis/engine.ts");
    expect(r.periods.every((p) => p.kpis.length === Object.keys(UNIT).length)).toBe(true); // every KPI, once
  });
});
