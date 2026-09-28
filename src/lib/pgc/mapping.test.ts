import { describe, it, expect } from "vitest";
import { buildStatement, toPgc3, ruleFor, aggregateByAccount } from "./mapping.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { toNumber, monthsBetween } from "../types.ts";

const FY: { kind: "closed_fy"; start: string; end: string } = { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" };

describe("toPgc3 / ruleFor", () => {
  it("rolls long subaccounts up to 3 digits", () => {
    expect(toPgc3("4300000012")).toBe("430");
    expect(toPgc3(70500001)).toBe("705");
  });
  it("rejects codes shorter than 3 digits", () => {
    expect(() => toPgc3("43")).toThrow();
  });
  it("uses longest-prefix rules", () => {
    expect(ruleFor("173")).toEqual({ kind: "liability", line: "longTermOtherLiabilities" });
    expect(ruleFor("170")).toEqual({ kind: "liability", line: "longTermFinancialDebt" });
    expect(ruleFor("630")).toEqual({ kind: "expense", line: "incomeTax" });
    expect(ruleFor("631")).toEqual({ kind: "expense", line: "otherTaxes" });
    expect(ruleFor("746")).toEqual({ kind: "income", line: "grantsTransferred" });
    expect(ruleFor("705")).toEqual({ kind: "income", line: "revenue" });
  });
});

describe("buildStatement on a pre-closing trial balance", () => {
  const { data: s, warnings } = buildStatement(tbSmallSl, FY);

  it("balances", () => {
    expect(s.balanceSheet.assets.total).toBe(519_000);
    expect(s.balanceSheet.equityAndLiabilities.total).toBe(519_000);
    expect(s.balanceSheet.imbalance).toBe(0);
    expect(warnings.find((w) => w.code === "balance_sheet_imbalance")).toBeUndefined();
  });

  it("classifies the balance sheet", () => {
    const a = s.balanceSheet.assets;
    const l = s.balanceSheet.equityAndLiabilities;
    expect(a.nonCurrentAssets).toBe(140_000);
    expect(a.tradeReceivables).toBe(150_000);
    expect(a.cash).toBe(174_000);
    expect(l.equity).toBe(221_000);
    expect(l.currentYearResultIncluded).toBe(71_000);
    expect(l.longTermFinancialDebt).toBe(100_000);
    expect(l.shortTermFinancialDebt).toBe(60_000); // 520 + overdrawn 572
    expect(l.relatedPartyShortTerm).toBe(25_000);
    expect(l.tradePayables).toBe(90_000);
  });

  it("flags an overdrawn bank account as debt", () => {
    expect(warnings.some((w) => w.code === "overdrawn_bank_account")).toBe(true);
  });

  it("builds the P&L and EBITDA excluding non-recurring gains", () => {
    const is = s.incomeStatement;
    expect(is.revenue).toBe(1_000_000);
    expect(is.operatingResult).toBe(94_000);
    expect(is.ebitda).toBe(110_000);
    expect(is.interestExpense).toBe(9_000);
    expect(is.netIncome).toBe(71_000);
  });

  it("keeps lineage to source rows", () => {
    const rev = s.lineage.revenue!;
    expect(rev).toHaveLength(1);
    expect(rev[0].sourceRef).toBe("doc:fixture:row:19");
  });
});

describe("post-regularisation trial balance", () => {
  it("warns that the P&L is closed into 129", () => {
    const bs = tbSmallSl.filter((b) => !/^[67]/.test(b.pgc3));
    bs.push({ account: "12900000", pgc3: "129", debit: 0, credit: 71_000, source: "upload", sourceRef: "doc:fixture:row:99" });
    const { data, warnings } = buildStatement(bs, FY);
    expect(data.pnlAvailable).toBe(false);
    expect(data.balanceSheet.imbalance).toBe(0);
    expect(warnings.find((w) => w.code === "pnl_unavailable")?.message).toContain("129");
  });
});

describe("helpers", () => {
  it("parses Spanish and English decimals", () => {
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("1234.56")).toBe(1234.56);
    expect(toNumber("(500,00)")).toBe(-500);
    expect(toNumber("")).toBe(0);
  });
  it("counts calendar months", () => {
    expect(monthsBetween("2025-01-01", "2025-12-31")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-06-30")).toBe(6);
  });
  it("aggregates duplicate account rows", () => {
    const out = aggregateByAccount(
      [{ account: 43000001, debit: 100, credit: 0 }, { account: 43000001, debit: 0, credit: 40 }],
      "holded", (a) => `holded:${a}`,
    );
    expect(out).toHaveLength(1);
    expect(out[0].debit - out[0].credit).toBe(60);
  });
});
