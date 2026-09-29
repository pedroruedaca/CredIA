import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { balanceBars, pnlBars } from "./balance.ts";

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

describe("pnlBars", () => {
  it("puts income on top and expenses plus profit below, both adding to the same total", () => {
    const b = pnlBars(closed)!;
    const sum = (xs: { value: number }[]) => Math.round(xs.reduce((s, x) => s + x.value, 0));
    expect(sum(b.top)).toBe(sum(b.bottom));
    expect(b.top[0]).toMatchObject({ id: "revenue", value: 1_000_000 });
    expect(b.bottom.at(-1)).toMatchObject({ id: "result", value: closed.incomeStatement.netIncome });
    const personnel = b.bottom.find((x) => x.id === "personnel")!;
    expect(personnel.accounts.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(personnel.value, 2);
  });
  it("shows a loss on the income side, and nothing without a P&L", () => {
    const loss = structuredClone(closed);
    loss.incomeStatement.personnel += 200_000;
    loss.incomeStatement.netIncome -= 200_000;
    const b = pnlBars(loss)!;
    expect(b.top.some((x) => x.id === "loss")).toBe(true);
    expect(b.bottom.some((x) => x.id === "result")).toBe(false);
    expect(Math.round(b.top.reduce((s, x) => s + x.value, 0))).toBe(Math.round(b.bottom.reduce((s, x) => s + x.value, 0)));
    expect(pnlBars({ ...closed, pnlAvailable: false })).toBeNull();
  });
});
