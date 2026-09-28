import { describe, it, expect } from "vitest";
import { buildStatement } from "../pgc/mapping.ts";
import { computeKpis, type Kpi } from "./engine.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";

const byKey = (k: Kpi[]) => Object.fromEntries(k.map((x) => [x.key, x]));

describe("computeKpis — full year", () => {
  const { data } = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" });
  const k = byKey(computeKpis(data));

  it("computes liquidity and leverage", () => {
    expect(k.currentRatio.value).toBe(1.91); // 379.000 / 198.000
    expect(k.quickRatio.value).toBe(1.66);
    expect(k.financialDebt.value).toBe(160_000);
    expect(k.netDebt.value).toBe(-14_000);
    expect(k.debtToEquity.value).toBe(0.72);
  });

  it("computes coverage", () => {
    expect(k.ebitda.value).toBe(110_000);
    expect(k.ebitdaMargin.value).toBe(11);
    expect(k.interestCoverage.value).toBe(12.22);
    expect(k.dscr.value).toBe(1.59); // 110.000 / (9.000 + 60.000)
    expect(k.dscr.note).toContain("conservative");
  });

  it("uses a CIRBE principal schedule when provided", () => {
    const k2 = byKey(computeKpis(data, { annualPrincipal: 40_000, annualPrincipalSource: "CIRBE 2025-12" }));
    expect(k2.dscr.value).toBe(2.24); // 110.000 / 49.000 = 2.245
    expect(k2.dscr.note).toContain("CIRBE");
  });

  it("computes DSO / DPO with VAT gross-up", () => {
    expect(k.dso.value).toBe(45);
    expect(k.dpo.value).toBe(42);
  });

  it("exposes formula and inputs for drill-down", () => {
    expect(k.dscr.inputs).toMatchObject({ principal: 60_000, interestAnnualised: 9_000 });
  });
});

describe("computeKpis — YTD annualisation", () => {
  it("annualises a 6-month period", () => {
    const half = tbSmallSl.map((b) => (/^[67]/.test(b.pgc3) ? { ...b, debit: b.debit / 2, credit: b.credit / 2 } : b));
    const { data } = buildStatement(half, { kind: "ytd", start: "2026-01-01", end: "2026-06-30" });
    const k = byKey(computeKpis(data));
    expect(data.months).toBe(6);
    expect(k.revenue.value).toBe(1_000_000);
    expect(k.ebitda.value).toBe(110_000);
  });
});

describe("computeKpis — edge cases", () => {
  it("returns null with a reason for negative equity and missing P&L", () => {
    const bsOnly = tbSmallSl
      .filter((b) => !/^[67]/.test(b.pgc3))
      .map((b) => (b.pgc3 === "113" ? { ...b, credit: 0, debit: 300_000 } : b));
    const { data } = buildStatement(bsOnly, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" });
    const k = byKey(computeKpis(data));
    expect(k.debtToEquity.value).toBeNull();
    expect(k.debtToEquity.note).toContain("363 LSC");
    expect(k.dscr.value).toBeNull();
  });
});
