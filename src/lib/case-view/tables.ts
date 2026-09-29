/**
 * Balance sheet and P&L laid out for the full tables and the exports: ordered rows, subtotals, and the accounts
 * (with source_ref) behind every line. Expenses are shown negative. Pure.
 */
import { LINE_LABEL } from "../../content/case-view.es.ts";
import type { CanonicalStatement, LineContribution } from "../pgc/mapping.ts";

export interface TableRow {
  key: string;
  label: string;
  kind: "line" | "subtotal" | "total" | "memo";
  /** One value per statement given (closed, ytd…); null when that statement is missing. */
  values: (number | null)[];
  /** Accounts behind the line, per statement, signed as displayed. */
  accounts: LineContribution[][];
}

type Get = (s: CanonicalStatement) => number;
type Spec = { key: string; kind: TableRow["kind"]; get: Get; lineage?: string; sign?: 1 | -1 };

const a = (k: keyof CanonicalStatement["balanceSheet"]["assets"]): Get => (s) => s.balanceSheet.assets[k];
const l = (k: keyof CanonicalStatement["balanceSheet"]["equityAndLiabilities"]): Get => (s) => s.balanceSheet.equityAndLiabilities[k];
const p = (k: keyof CanonicalStatement["incomeStatement"]): Get => (s) => s.incomeStatement[k];

const line = (key: string, get: Get, sign: 1 | -1 = 1): Spec => ({ key, kind: "line", get, lineage: key, sign });

const ASSETS: Spec[] = [
  line("nonCurrentAssets", a("nonCurrentAssets")),
  line("inventories", a("inventories")),
  line("tradeReceivables", a("tradeReceivables")),
  line("otherReceivables", a("otherReceivables")),
  line("shortTermInvestments", a("shortTermInvestments")),
  line("cash", a("cash")),
  line("prepayments", a("prepayments")),
  { key: "totalAssets", kind: "total", get: a("total") },
];

const LIABILITIES: Spec[] = [
  line("equity", l("equity")),
  { key: "currentYearResultIncluded", kind: "memo", get: l("currentYearResultIncluded") },
  line("provisions", l("provisions")),
  line("longTermFinancialDebt", l("longTermFinancialDebt")),
  line("longTermOtherLiabilities", l("longTermOtherLiabilities")),
  line("shortTermFinancialDebt", l("shortTermFinancialDebt")),
  line("relatedPartyShortTerm", l("relatedPartyShortTerm")),
  line("tradePayables", l("tradePayables")),
  line("otherCurrentLiabilities", l("otherCurrentLiabilities")),
  { key: "totalLiabilities", kind: "total", get: l("total") },
];

const PNL: Spec[] = [
  line("revenue", p("revenue")),
  line("otherOperatingIncome", p("otherOperatingIncome")),
  line("cogs", p("cogs"), -1),
  line("personnel", p("personnel"), -1),
  line("externalServices", p("externalServices"), -1),
  line("otherTaxes", p("otherTaxes"), -1),
  line("otherOperatingExpenses", p("otherOperatingExpenses"), -1),
  { key: "ebitda", kind: "subtotal", get: p("ebitda") },
  line("depreciation", p("depreciation"), -1),
  line("operatingImpairments", p("operatingImpairments"), -1),
  line("grantsTransferred", p("grantsTransferred")),
  line("nonRecurringResult", p("nonRecurringResult")),
  { key: "operatingResult", kind: "subtotal", get: p("operatingResult") },
  line("financialIncome", p("financialIncome")),
  line("financialExpense", p("financialExpense"), -1),
  line("financialImpairments", p("financialImpairments"), -1),
  { key: "financialResult", kind: "subtotal", get: p("financialResult") },
  { key: "preTaxResult", kind: "subtotal", get: p("preTaxResult") },
  line("incomeTax", p("incomeTax"), -1),
  { key: "netIncome", kind: "total", get: p("netIncome") },
];

function build(specs: Spec[], statements: (CanonicalStatement | null)[], skipEmpty: boolean): TableRow[] {
  return specs
    .map((spec) => {
      const sign = spec.sign ?? 1;
      return {
        key: spec.key,
        label: LINE_LABEL[spec.key] ?? spec.key,
        kind: spec.kind,
        values: statements.map((s) => (s ? Math.round(spec.get(s) * sign * 100) / 100 : null)),
        accounts: statements.map((s) =>
          s && spec.lineage ? (s.lineage[spec.lineage as keyof CanonicalStatement["lineage"]] ?? []).map((c) => ({ ...c, amount: c.amount * sign })) : [],
        ),
      };
    })
    .filter((r) => !skipEmpty || r.kind !== "line" && r.kind !== "memo" || r.values.some((v) => v !== null && v !== 0));
}

export function statementTables(statements: (CanonicalStatement | null)[], skipEmpty = true) {
  const withPnl = statements.map((s) => (s?.pnlAvailable ? s : null));
  return {
    assets: build(ASSETS, statements, skipEmpty),
    liabilities: build(LIABILITIES, statements, skipEmpty),
    pnl: withPnl.some(Boolean) ? build(PNL, withPnl, skipEmpty) : [],
  };
}
