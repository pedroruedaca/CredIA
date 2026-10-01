import { describe, expect, it } from "vitest";
import { accounts2025 } from "../__fixtures__/annual-accounts.ts";
import { m303Return } from "../__fixtures__/modelo303.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { checkModelo303VsBooks, checkN43InflowsVsRevenue, checkModelo303Quarters } from "../checks/engine.ts";
import { assessExtraction } from "../extract/assess.ts";
import { computeKpis } from "../kpis/engine.ts";
import type { Modelo200Extraction } from "../schema/canonical.ts";
import { caseSummary, summaryText } from "../summary.ts";
import { statementTables } from "../case-view/tables.ts";
import { coveredYtdEnd, declaredSales, returnsForPeriod } from "../tax/modelo303.ts";
import { statementFromAnnualAccounts } from "./annual-accounts.ts";
import { buildStatement } from "./mapping.ts";
import { modelo200Period, statementFromModelo200, statementFromModelo303 } from "./tax-returns.ts";

const FY2025 = { kind: "closed_fy" as const, start: "2025-01-01", end: "2025-12-31" };
const year2025 = (sales = 250_000) => (["1T", "2T", "3T", "4T"] as const).map((q) => m303Return(2025, q, sales));

describe("Modelo 303 returns for a period", () => {
  it("declared sales add the sales without Spanish VAT", () => {
    expect(declaredSales({ accruedBase: 100_000, intraEuSupplies: 20_000, exports: 5_000, notSubjectLocation: 1_000, reverseChargeSupplies: null })).toBe(126_000);
    expect(declaredSales({ accruedBase: 100_000, intraEuSupplies: null, exports: null })).toBe(100_000);
  });

  it("counts a quarter once even with its monthly returns, and the newest upload of a period", () => {
    const r = returnsForPeriod(
      [...year2025(), m303Return(2025, "01", 1), m303Return(2025, "2T", 300_000, "2026-09-25T10:00:00Z")],
      FY2025.start,
      FY2025.end,
    );
    expect(r.complete).toBe(true);
    expect(r.used.map((x) => x.data.period)).toEqual(["1T", "2T", "3T", "4T"]);
    expect(r.used.reduce((s, x) => s + declaredSales(x.data), 0)).toBe(1_050_000);
  });

  it("a year to date runs to the last full month covered without gaps, from one quarter", () => {
    expect(coveredYtdEnd([m303Return(2026, "1T"), m303Return(2026, "04"), m303Return(2026, "05")], "2026-01-01")).toBe("2026-05-31");
    expect(coveredYtdEnd([m303Return(2026, "1T"), m303Return(2026, "3T")], "2026-01-01")).toBe("2026-03-31");
    expect(coveredYtdEnd([m303Return(2026, "01"), m303Return(2026, "02")], "2026-01-01")).toBeNull();
    expect(coveredYtdEnd([m303Return(2026, "2T")], "2026-01-01")).toBeNull();
  });
});

describe("revenue-only statement from the Modelo 303", () => {
  const s = statementFromModelo303(year2025(), FY2025)!;

  it("has revenue with one source per return and nothing else", () => {
    expect(s).toMatchObject({ scope: "revenue", pnlAvailable: false, months: 12, incomeStatement: { revenue: 1_000_000 } });
    expect(s.lineage.revenue!.map((c) => c.account)).toEqual(["Modelo 303 1T 25 · ventas declaradas", "Modelo 303 2T 25 · ventas declaradas", "Modelo 303 3T 25 · ventas declaradas", "Modelo 303 4T 25 · ventas declaradas"]);
    expect(s.lineage.revenue![0].sourceRef).toBe("doc:303-2025-1T-2026-09-20:page:2");
  });

  it("is not built when a month is missing", () => {
    expect(statementFromModelo303(year2025().slice(1), FY2025)).toBeNull();
  });

  it("gives revenue as the only KPI; the rest is unknown, not zero", () => {
    const k = Object.fromEntries(computeKpis(s).map((x) => [x.key, x]));
    expect(k.revenue.value).toBe(1_000_000);
    for (const key of ["ebitda", "currentRatio", "financialDebt", "netDebt", "dso"]) expect(k[key]).toMatchObject({ value: null, note: expect.stringContaining("Modelo 303") });
  });

  it("shows only the revenue row in the tables and no balance sheet", () => {
    const closed = buildStatement(tbSmallSl, FY2025).data;
    const ytd = statementFromModelo303([m303Return(2026, "1T"), m303Return(2026, "2T")], { kind: "ytd", start: "2026-01-01", end: "2026-06-30" })!;
    const t = statementTables([closed, ytd]);
    expect(t.assets.every((r) => r.values[1] === null)).toBe(true);
    expect(t.pnl.find((r) => r.key === "revenue")!.values).toEqual([closed.incomeStatement.revenue, 500_000]);
    expect(t.pnl.filter((r) => r.key !== "revenue").every((r) => r.values[1] === null)).toBe(true);
    expect(statementTables([s]).assets).toEqual([]);
  });

  it("feeds the bank-inflows check and the summary, said as declared sales", () => {
    expect(checkN43InflowsVsRevenue(s, []).message).not.toContain("Sin cuenta de resultados");
    const text = summaryText(caseSummary({ closed: s, ytd: null, cirbe: null, closedSource: "modelo303" }));
    expect(text).toContain("Declaró ventas por");
    expect(text).toContain("en sus Modelos 303 de IVA");
    expect(text).toContain("Del ejercicio cerrado solo hay las ventas declaradas en IVA (Modelo 303).");
    expect(text).not.toContain("EBITDA");
  });
});

describe("closed year from the Modelo 200", () => {
  const wire = { document_type: "modelo200" as const, company_nif: "B12345674", company_name: "X", legible: true, fiscal_year: 2025, period_end: "2025-12-31" };
  const f = (value: number) => ({ value, page: 3 });
  const a = assessExtraction(
    "modelo200",
    {
      ...wire,
      revenue: f(1_500_000), operating_result: f(125_000), pre_tax_result: f(112_000), net_income: f(84_000), equity: f(380_000), total_assets: f(930_000),
      model: "pymes", period_months: 12, balance_sheet_page: 3, income_statement_page: 6, current_year: accounts2025,
    },
    { fileName: "200.pdf", caseCif: "B12345674", companyName: "X", lenderName: "Y", expectedFiscalYear: 2025 },
  );
  const m200 = (a.canonical as { data: Modelo200Extraction }).data;

  it("builds the same statement as the annual accounts would, with the return's pages", () => {
    const period = modelo200Period(m200, null)!;
    expect(period).toEqual(FY2025);
    const built = statementFromModelo200(m200, "m200doc", period)!;
    const asAccounts = statementFromAnnualAccounts({ pages: { balanceSheet: 3, incomeStatement: 6 }, current: m200.statement!.current }, "m200doc", period).data;
    expect(built.data.incomeStatement).toEqual(asAccounts.incomeStatement);
    expect(built.data.incomeStatement.ebitda).toBe(165_000);
    expect(built.data.derived.financialDebt).toBe(310_000);
    expect(built.data.lineage.revenue![0].sourceRef).toBe("doc:m200doc:page:6");
  });

  it("names the return in its warnings", () => {
    const broken = { ...m200, statement: { ...m200.statement!, current: { ...m200.statement!.current, totalAssets: 999_000 } } };
    const w = statementFromModelo200(broken, "m200doc", FY2025)!.warnings;
    expect(w.map((x) => x.code)).toContain("m200_total_assets_mismatch");
    expect(w.find((x) => x.code === "balance_sheet_imbalance")!.message).toContain("del Modelo 200");
  });

  it("is not built from an extraction without the statement pages", () => {
    expect(statementFromModelo200({ ...m200, statement: null }, "m200doc", FY2025)).toBeNull();
    expect(modelo200Period({ ...m200, statement: undefined }, "2025-12-31")).toBeNull();
  });
});

describe("checkModelo303VsBooks", () => {
  const closed = buildStatement(tbSmallSl, FY2025).data;
  const revenue = closed.incomeStatement.revenue;

  it("passes when the declared sales are within 10 % or 5.000 € of the books", () => {
    const c = checkModelo303VsBooks(closed, year2025(revenue / 4 + 1_000));
    expect(c).toMatchObject({ key: "m303_vs_books_revenue", status: "pass", evidence: { values: { declared_sales: revenue + 4_000, books: revenue, returns: 4 } } });
  });

  it("warns on a larger gap and names where the statement comes from", () => {
    const c = checkModelo303VsBooks(closed, year2025(revenue / 4 * 0.8), "el Modelo 200");
    expect(c).toMatchObject({ status: "fail", severity: "warn" });
    expect(c.message).toContain("difieren del Modelo 200");
    expect(c.evidence.values.difference).toBe(revenue * 0.2);
    expect(c.evidence.sources[0]).toBe("doc:303-2025-1T-2026-09-20:page:2");
  });

  it("does not apply unless the returns cover every month of the period", () => {
    expect(checkModelo303VsBooks(closed, year2025().slice(0, 3)).status).toBe("not_applicable");
    const ytdHolded = buildStatement(tbSmallSl, { kind: "ytd", start: "2025-01-01", end: "2025-09-28" }).data;
    expect(checkModelo303VsBooks(ytdHolded, year2025()).status).toBe("not_applicable");
  });

  it("the quarter check reports declared sales per quarter", () => {
    const c = checkModelo303Quarters([m303Return(2025, "3T"), m303Return(2025, "4T", 100_000), m303Return(2026, "1T"), m303Return(2026, "2T")], "2026-10-01");
    expect(c.evidence.values["4T 25"]).toBe(100_000);
  });
});
