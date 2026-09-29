import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { balanceBars } from "./balance.ts";

const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;

describe("balanceBars", () => {
  it("splits assets and liabilities into proportional segments that carry their accounts", () => {
    const b = balanceBars(closed);
    expect(b.total).toBe(closed.balanceSheet.assets.total);
    const sum = (xs: { pct: number }[]) => Math.round(xs.reduce((s, x) => s + x.pct, 0));
    expect(sum(b.top)).toBe(100);
    expect(sum(b.bottom)).toBe(100);
    const st = b.bottom.find((x) => x.id === "stDebt")!;
    expect(st.value).toBe(closed.balanceSheet.equityAndLiabilities.shortTermFinancialDebt);
    expect(st.accounts.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(st.value, 2);
    expect(st.accounts.every((a) => a.sourceRef.length > 0)).toBe(true);
  });
  it("lists non-positive segments instead of drawing them", () => {
    const neg = structuredClone(closed);
    neg.balanceSheet.equityAndLiabilities.equity = -10_000;
    const b = balanceBars(neg);
    expect(b.bottom.find((x) => x.id === "equity")).toBeUndefined();
    expect(b.notDrawn.map((x) => x.id)).toEqual(["equity"]);
  });
});
