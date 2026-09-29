import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { statementTables } from "./tables.ts";

const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;

describe("statementTables", () => {
  const t = statementTables([closed, null]);
  it("lays out P&L lines so they add up to EBITDA and net income", () => {
    const sumTo = (key: string) => {
      const i = t.pnl.findIndex((r) => r.key === key);
      const start = t.pnl.slice(0, i).map((r) => r.kind).lastIndexOf("subtotal") + 1;
      return t.pnl.slice(start, i).filter((r) => r.kind === "line").reduce((s, r) => s + (r.values[0] ?? 0), 0);
    };
    expect(sumTo("ebitda")).toBeCloseTo(closed.incomeStatement.ebitda, 2);
    expect(t.pnl.find((r) => r.key === "ebitda")!.values[0]).toBe(110_000);
    expect(t.pnl.find((r) => r.key === "netIncome")!.values[0]).toBeCloseTo(closed.incomeStatement.netIncome, 2);
    expect(t.pnl.find((r) => r.key === "personnel")!.values[0]).toBeLessThan(0);
  });
  it("balances, keeps missing periods as null, and carries signed lineage", () => {
    const total = (rows: typeof t.assets) => rows.find((r) => r.kind === "total")!.values[0];
    expect(total(t.assets)).toBeCloseTo(total(t.liabilities)!, 2);
    expect(t.assets.every((r) => r.values[1] === null)).toBe(true);
    const cogs = t.pnl.find((r) => r.key === "cogs");
    if (cogs) expect(cogs.accounts[0].reduce((s, c) => s + c.amount, 0)).toBeCloseTo(cogs.values[0]!, 2);
    const cash = t.assets.find((r) => r.key === "cash")!;
    expect(cash.accounts[0].reduce((s, c) => s + c.amount, 0)).toBeCloseTo(cash.values[0]!, 2);
  });
});
