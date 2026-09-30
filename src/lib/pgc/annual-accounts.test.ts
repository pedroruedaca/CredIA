import { describe, expect, it } from "vitest";
import { accounts2025, annualAccountsWireSample } from "../__fixtures__/annual-accounts.ts";
import { assessExtraction } from "../extract/assess.ts";
import type { AnnualAccountsExtraction } from "../schema/canonical.ts";
import { CanonicalStatementSchema } from "../schema/canonical.ts";
import { computeKpis } from "../kpis/engine.ts";
import { annualAccountsPeriod, statementFromAnnualAccounts } from "./annual-accounts.ts";

const CTX = { fileName: "cuentas.pdf", caseCif: "B12345674", companyName: "Distribuciones Ejemplo SL", lenderName: "Fondo Ejemplo", expectedFiscalYear: 2025 };

function extraction(wire = annualAccountsWireSample): AnnualAccountsExtraction {
  const a = assessExtraction("cuentas_anuales", wire, CTX);
  expect(a.status).toBe("parsed");
  if (a.canonical?.kind !== "annual_accounts") throw new Error("expected annual accounts");
  return a.canonical.data;
}

describe("assessExtraction · cuentas anuales", () => {
  it("keeps both year columns in euros, with pages", () => {
    const a = extraction();
    expect(a).toMatchObject({ fiscalYear: 2025, periodEnd: "2025-12-31", months: 12, model: "abreviado", pages: { balanceSheet: 3, incomeStatement: 5 } });
    expect(a.current.revenue).toBe(1_500_000);
    expect(a.prior?.revenue).toBe(1_300_000);
  });

  it("scales figures printed in thousands", () => {
    const k = Object.fromEntries(Object.entries(accounts2025).map(([key, v]) => [key, v / 1000])) as typeof accounts2025;
    const a = extraction({ ...annualAccountsWireSample, units: "thousands", current_year: k, prior_year_shown: false });
    expect(a.current.totalAssets).toBe(930_000);
    expect(a.prior).toBeNull();
  });

  it("rejects the wrong year and empty accounts", () => {
    expect(assessExtraction("cuentas_anuales", { ...annualAccountsWireSample, fiscal_year: 2023 }, CTX).status).toBe("failed");
    const empty = Object.fromEntries(Object.keys(accounts2025).map((k) => [k, 0])) as typeof accounts2025;
    expect(assessExtraction("cuentas_anuales", { ...annualAccountsWireSample, current_year: empty }, CTX).status).toBe("failed");
  });
});

describe("statementFromAnnualAccounts", () => {
  const a = extraction();
  const period = annualAccountsPeriod(a, null)!;
  const { data: s, warnings } = statementFromAnnualAccounts(a, "doc-1", period);

  it("covers the closed year", () => {
    expect(period).toEqual({ kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" });
    expect(annualAccountsPeriod({ ...a, periodEnd: "2025-06-30" }, null)).toEqual({ kind: "closed_fy", start: "2024-07-01", end: "2025-06-30" });
  });

  it("rebuilds a balanced statement matching the printed totals (hand-checked)", () => {
    expect(CanonicalStatementSchema.safeParse(s).success).toBe(true);
    expect(warnings).toEqual([]);
    expect(s.balanceSheet.assets).toMatchObject({ nonCurrentAssets: 420_000, inventories: 85_000, tradeReceivables: 280_000, otherReceivables: 30_000, shortTermInvestments: 15_000, prepayments: 5_000, cash: 95_000, total: 930_000 });
    expect(s.balanceSheet.equityAndLiabilities).toMatchObject({
      equity: 380_000, provisions: 0, longTermFinancialDebt: 235_000, longTermOtherLiabilities: 25_000, shortTermFinancialDebt: 75_000,
      relatedPartyShortTerm: 15_000, tradePayables: 150_000, otherCurrentLiabilities: 50_000, currentYearResultIncluded: 0, total: 930_000,
    });
    expect(s.balanceSheet.imbalance).toBe(0);
    expect(s.incomeStatement).toMatchObject({ revenue: 1_500_000, operatingResult: 125_000, ebitda: 165_000, financialResult: -13_000, preTaxResult: 112_000, netIncome: 84_000, interestExpense: 14_000 });
    expect(s.derived).toEqual({ financialDebt: 310_000, netDebt: 200_000, workingCapital: 220_000, currentAssets: 510_000, currentLiabilities: 290_000 });
  });

  it("gives every line its page in the PDF", () => {
    expect(s.lineage.cash).toEqual([{ account: "Efectivo y otros activos líquidos", amount: 95_000, sourceRef: "doc:doc-1:page:3" }]);
    expect(s.lineage.revenue?.[0].sourceRef).toBe("doc:doc-1:page:5");
    expect(s.lineage.longTermOtherLiabilities?.[0].amount).toBe(25_000);
  });

  it("feeds the KPI engine", () => {
    const k = Object.fromEntries(computeKpis(s).map((x) => [x.key, x.value]));
    expect(k.ebitda).toBe(165_000);
    expect(k.netDebtToEbitda).toBeCloseTo(200_000 / 165_000, 2);
    expect(k.currentRatio).toBeCloseTo(510 / 290, 2);
  });

  it("reconciles unnamed lines against the printed totals and flags what does not add up", () => {
    const y = { ...a.current, operatingResult: 135_000, financialResult: -13_000, preTaxResult: 122_000, netIncome: 94_000, totalAssets: 940_000 };
    const r = statementFromAnnualAccounts({ ...a, current: y }, "doc-1", period);
    expect(r.data.incomeStatement.operatingResult).toBe(135_000);
    expect(r.data.incomeStatement.ebitda).toBe(165_000); // the unidentified 10.000 stay out of EBITDA
    expect(r.data.incomeStatement.netIncome).toBe(94_000);
    expect(r.warnings.map((w) => w.code)).toEqual(["ca_total_assets_mismatch", "balance_sheet_imbalance"]);
    const big = statementFromAnnualAccounts({ ...a, current: { ...y, operatingResult: 225_000, preTaxResult: 212_000, netIncome: 184_000, totalAssets: 930_000 } }, "doc-1", period);
    expect(big.warnings.map((w) => w.code)).toContain("ca_operating_lines_unreconciled");
  });

  it("builds the prior year from the same model", () => {
    const prior = statementFromAnnualAccounts(a, "doc-1", { kind: "closed_fy", start: "2024-01-01", end: "2024-12-31" }, a.prior!);
    expect(prior.warnings).toEqual([]);
    expect(prior.data.incomeStatement.netIncome).toBe(34_000);
    expect(prior.data.balanceSheet.imbalance).toBe(0);
  });
});
