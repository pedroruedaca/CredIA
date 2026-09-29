/**
 * PGC (Plan General de Contabilidad, normal + Pymes) → canonical statement lines.
 *
 * Input: LedgerBalance[] for one period (a trial balance, from upload or Holded).
 * Classification happens per ORIGINAL account (so a 572 bank at -50k is caught as an overdraft
 * even if other 572 subaccounts are positive), using the account's 3-digit PGC code.
 */
import type { LedgerBalance, Period, Warning } from "../types.ts";
import { monthsBetween } from "../types.ts";

const eurText = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} €`;

export type AssetLine =
  | "nonCurrentAssets" | "inventories" | "tradeReceivables" | "otherReceivables"
  | "shortTermInvestments" | "cash" | "prepayments";
export type LiabilityLine =
  | "equity" | "provisions" | "longTermFinancialDebt" | "longTermOtherLiabilities"
  | "shortTermFinancialDebt" | "relatedPartyShortTerm" | "tradePayables" | "otherCurrentLiabilities";
export type IncomeLine =
  | "revenue" | "otherOperatingIncome" | "grantsTransferred" | "nonRecurringResult" | "financialIncome";
export type ExpenseLine =
  | "cogs" | "externalServices" | "otherTaxes" | "personnel" | "otherOperatingExpenses"
  | "depreciation" | "operatingImpairments" | "financialExpense" | "financialImpairments" | "incomeTax";
export type Line = AssetLine | LiabilityLine | IncomeLine | ExpenseLine;

type Rule =
  | { kind: "asset"; line: AssetLine }
  | { kind: "liability"; line: LiabilityLine }
  | { kind: "bySign"; debit: AssetLine | "equity"; credit: LiabilityLine }
  | { kind: "income"; line: IncomeLine }
  | { kind: "expense"; line: ExpenseLine }
  | { kind: "ignore" };

/** Longest-prefix match on the 3-digit code. Keys are 1–3 digit prefixes. */
const RULES: Record<string, Rule> = {
  // Group 1 — financing
  "10": { kind: "liability", line: "equity" },
  "11": { kind: "liability", line: "equity" },
  "12": { kind: "liability", line: "equity" },
  "13": { kind: "liability", line: "equity" },
  "14": { kind: "liability", line: "provisions" },
  "15": { kind: "liability", line: "longTermOtherLiabilities" },
  "16": { kind: "liability", line: "longTermFinancialDebt" }, // group/related-party LT debt
  "17": { kind: "liability", line: "longTermFinancialDebt" },
  "172": { kind: "liability", line: "longTermOtherLiabilities" },
  "173": { kind: "liability", line: "longTermOtherLiabilities" }, // fixed-asset suppliers LT
  "18": { kind: "liability", line: "longTermOtherLiabilities" },
  "19": { kind: "liability", line: "equity" },
  // Group 2 — non-current assets (28/29 contra accounts net naturally)
  "2": { kind: "asset", line: "nonCurrentAssets" },
  // Group 3 — inventories (39 impairment nets naturally)
  "3": { kind: "asset", line: "inventories" },
  // Group 4 — trade
  "40": { kind: "bySign", debit: "otherReceivables", credit: "tradePayables" },
  "41": { kind: "bySign", debit: "otherReceivables", credit: "tradePayables" },
  "43": { kind: "bySign", debit: "tradeReceivables", credit: "otherCurrentLiabilities" },
  "44": { kind: "bySign", debit: "otherReceivables", credit: "otherCurrentLiabilities" },
  "46": { kind: "bySign", debit: "otherReceivables", credit: "otherCurrentLiabilities" },
  "47": { kind: "bySign", debit: "otherReceivables", credit: "otherCurrentLiabilities" },
  "474": { kind: "asset", line: "nonCurrentAssets" }, // deferred tax assets
  "479": { kind: "liability", line: "longTermOtherLiabilities" }, // deferred tax liabilities
  "48": { kind: "bySign", debit: "prepayments", credit: "otherCurrentLiabilities" },
  "49": { kind: "asset", line: "tradeReceivables" }, // 490/493 impairment (contra)
  "499": { kind: "liability", line: "provisions" },
  // Group 5 — financial
  "50": { kind: "liability", line: "shortTermFinancialDebt" },
  "51": { kind: "liability", line: "shortTermFinancialDebt" },
  "52": { kind: "liability", line: "shortTermFinancialDebt" },
  "522": { kind: "liability", line: "otherCurrentLiabilities" },
  "523": { kind: "liability", line: "otherCurrentLiabilities" },
  "526": { kind: "liability", line: "otherCurrentLiabilities" },
  "529": { kind: "liability", line: "provisions" },
  "53": { kind: "asset", line: "shortTermInvestments" },
  "54": { kind: "asset", line: "shortTermInvestments" },
  "55": { kind: "bySign", debit: "otherReceivables", credit: "otherCurrentLiabilities" },
  "551": { kind: "bySign", debit: "otherReceivables", credit: "relatedPartyShortTerm" },
  "552": { kind: "bySign", debit: "otherReceivables", credit: "relatedPartyShortTerm" },
  "553": { kind: "bySign", debit: "otherReceivables", credit: "relatedPartyShortTerm" },
  "557": { kind: "liability", line: "equity" }, // interim dividend (debit reduces equity)
  "56": { kind: "bySign", debit: "shortTermInvestments", credit: "otherCurrentLiabilities" },
  "567": { kind: "asset", line: "prepayments" },
  "57": { kind: "bySign", debit: "cash", credit: "shortTermFinancialDebt" }, // overdrawn bank = debt
  "58": { kind: "bySign", debit: "otherReceivables", credit: "otherCurrentLiabilities" },
  "59": { kind: "asset", line: "shortTermInvestments" },
  // Group 6 — expenses
  "60": { kind: "expense", line: "cogs" },
  "61": { kind: "expense", line: "cogs" },
  "62": { kind: "expense", line: "externalServices" },
  "63": { kind: "expense", line: "otherTaxes" },
  "630": { kind: "expense", line: "incomeTax" },
  "633": { kind: "expense", line: "incomeTax" },
  "638": { kind: "expense", line: "incomeTax" },
  "64": { kind: "expense", line: "personnel" },
  "65": { kind: "expense", line: "otherOperatingExpenses" },
  "66": { kind: "expense", line: "financialExpense" },
  "67": { kind: "income", line: "nonRecurringResult" },
  "68": { kind: "expense", line: "depreciation" },
  "69": { kind: "expense", line: "operatingImpairments" },
  "696": { kind: "expense", line: "financialImpairments" },
  "697": { kind: "expense", line: "financialImpairments" },
  "698": { kind: "expense", line: "financialImpairments" },
  "699": { kind: "expense", line: "financialImpairments" },
  // Group 7 — income
  "70": { kind: "income", line: "revenue" },
  "7": { kind: "income", line: "otherOperatingIncome" },
  "746": { kind: "income", line: "grantsTransferred" },
  "76": { kind: "income", line: "financialIncome" },
  "77": { kind: "income", line: "nonRecurringResult" },
  "79": { kind: "expense", line: "operatingImpairments" }, // reversals: credit → negative expense
  "796": { kind: "expense", line: "financialImpairments" },
  "797": { kind: "expense", line: "financialImpairments" },
  "798": { kind: "expense", line: "financialImpairments" },
  "799": { kind: "expense", line: "financialImpairments" },
  // Groups 8/9 — income/expense recognised in equity; closed into 13x
  "8": { kind: "ignore" },
  "9": { kind: "ignore" },
};

/** Interest subset of group 66, used for DSCR / interest coverage. */
export const INTEREST_ACCOUNTS = ["661", "662", "665"] as const;

export function toPgc3(account: string | number): string {
  const digits = String(account).replace(/\D/g, "");
  if (digits.length < 3) throw new Error(`Account "${account}" has fewer than 3 digits`);
  return digits.slice(0, 3);
}

export function ruleFor(pgc3: string): Rule | undefined {
  for (let len = 3; len >= 1; len--) {
    const r = RULES[pgc3.slice(0, len)];
    if (r) return r;
  }
  return undefined;
}

export interface LineContribution {
  account: string;
  amount: number; // signed so that it adds to the line (assets/expenses: debit-credit; liabilities/income: credit-debit)
  sourceRef: string;
}

export interface CanonicalStatement {
  period: Period;
  months: number;
  currency: "EUR";
  pnlAvailable: boolean;
  balanceSheet: {
    assets: Record<AssetLine, number> & { total: number };
    equityAndLiabilities: Record<LiabilityLine, number> & {
      currentYearResultIncluded: number;
      total: number;
    };
    imbalance: number;
  };
  incomeStatement: Record<IncomeLine | ExpenseLine, number> & {
    interestExpense: number;
    operatingResult: number;
    ebitda: number;
    financialResult: number;
    preTaxResult: number;
    netIncome: number;
  };
  derived: {
    financialDebt: number;
    netDebt: number;
    workingCapital: number;
    currentAssets: number;
    currentLiabilities: number;
  };
  lineage: Partial<Record<Line | "interestExpense", LineContribution[]>>;
}

const ASSET_LINES: AssetLine[] = [
  "nonCurrentAssets", "inventories", "tradeReceivables", "otherReceivables",
  "shortTermInvestments", "cash", "prepayments",
];
const LIAB_LINES: LiabilityLine[] = [
  "equity", "provisions", "longTermFinancialDebt", "longTermOtherLiabilities",
  "shortTermFinancialDebt", "relatedPartyShortTerm", "tradePayables", "otherCurrentLiabilities",
];
const INCOME_LINES: IncomeLine[] = [
  "revenue", "otherOperatingIncome", "grantsTransferred", "nonRecurringResult", "financialIncome",
];
const EXPENSE_LINES: ExpenseLine[] = [
  "cogs", "externalServices", "otherTaxes", "personnel", "otherOperatingExpenses",
  "depreciation", "operatingImpairments", "financialExpense", "financialImpairments", "incomeTax",
];

const zero = <K extends string>(keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildStatement(
  balances: LedgerBalance[],
  period: Period,
): { data: CanonicalStatement; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const assets = zero(ASSET_LINES);
  const liabs = zero(LIAB_LINES);
  const pnl = { ...zero(INCOME_LINES), ...zero(EXPENSE_LINES) };
  const lineage: CanonicalStatement["lineage"] = {};
  const push = (line: Line | "interestExpense", c: LineContribution) =>
    (lineage[line] ??= []).push(c);

  let interestExpense = 0;
  let pnlTouched = false;
  let unmapped = 0;

  for (const b of balances) {
    const pgc3 = b.pgc3 || toPgc3(b.account);
    const net = b.debit - b.credit; // debit-positive
    if (Math.abs(net) < 0.005) continue;
    const rule = ruleFor(pgc3);
    if (!rule) {
      unmapped += net;
      warnings.push({ code: "unmapped_account", message: `La cuenta ${b.account} (${pgc3}) no tiene regla de mapeo PGC`, detail: { account: b.account, net: r2(net), source_ref: b.sourceRef } });
      continue;
    }
    const ref = { account: b.account, sourceRef: b.sourceRef };
    switch (rule.kind) {
      case "asset":
        assets[rule.line] += net;
        push(rule.line, { ...ref, amount: net });
        break;
      case "liability":
        liabs[rule.line] += -net;
        push(rule.line, { ...ref, amount: -net });
        break;
      case "bySign":
        if (net > 0) {
          if (rule.debit === "equity") { liabs.equity -= net; push("equity", { ...ref, amount: -net }); }
          else { assets[rule.debit] += net; push(rule.debit, { ...ref, amount: net }); }
        } else {
          liabs[rule.credit] += -net;
          push(rule.credit, { ...ref, amount: -net });
          if (pgc3.startsWith("57")) {
            warnings.push({
              code: "overdrawn_bank_account",
              message: `La cuenta bancaria ${b.account} tiene saldo acreedor (${eurText(-net)}); se trata como deuda financiera a corto plazo`,
              detail: { account: b.account, amount: r2(-net), source_ref: b.sourceRef },
            });
          }
        }
        break;
      case "income":
        pnl[rule.line] += -net;
        pnlTouched = true;
        push(rule.line, { ...ref, amount: -net });
        break;
      case "expense":
        pnl[rule.line] += net;
        pnlTouched = true;
        push(rule.line, { ...ref, amount: net });
        if ((INTEREST_ACCOUNTS as readonly string[]).includes(pgc3)) {
          interestExpense += net;
          push("interestExpense", { ...ref, amount: net });
        }
        break;
      case "ignore":
        break;
    }
  }

  const operatingResult =
    pnl.revenue + pnl.otherOperatingIncome + pnl.grantsTransferred + pnl.nonRecurringResult
    - pnl.cogs - pnl.externalServices - pnl.otherTaxes - pnl.personnel - pnl.otherOperatingExpenses
    - pnl.depreciation - pnl.operatingImpairments;
  const ebitda =
    operatingResult + pnl.depreciation + pnl.operatingImpairments
    - pnl.nonRecurringResult - pnl.grantsTransferred;
  const financialResult = pnl.financialIncome - pnl.financialExpense - pnl.financialImpairments;
  const preTaxResult = operatingResult + financialResult;
  const netIncome = preTaxResult - pnl.incomeTax;

  // A pre-closing trial balance still has groups 6/7 open: their net is the current-year result
  // and must be added to equity for the balance sheet to balance.
  const currentYearResultIncluded = pnlTouched ? netIncome : 0;
  liabs.equity += currentYearResultIncluded;

  if (!pnlTouched) {
    const has129 = balances.some((b) => (b.pgc3 || toPgc3(b.account)) === "129" && Math.abs(b.debit - b.credit) > 0.005);
    warnings.push({
      code: "pnl_unavailable",
      message: has129
        ? "Los grupos 6 y 7 están regularizados contra la 129 (balance posterior al cierre). Pide un sumas y saldos previo al cierre para obtener la cuenta de resultados."
        : "No hay cuentas de resultados en este periodo.",
    });
  }

  const totalAssets = ASSET_LINES.reduce((s, k) => s + assets[k], 0);
  const totalEL = LIAB_LINES.reduce((s, k) => s + liabs[k], 0);
  const imbalance = r2(totalAssets - totalEL);
  if (Math.abs(imbalance) > 1) {
    warnings.push({ code: "balance_sheet_imbalance", message: `El activo y el patrimonio neto más pasivo difieren en ${imbalance} €`, detail: { unmapped: r2(unmapped) } });
  }

  const financialDebt = liabs.longTermFinancialDebt + liabs.shortTermFinancialDebt;
  const currentAssets = assets.inventories + assets.tradeReceivables + assets.otherReceivables
    + assets.shortTermInvestments + assets.cash + assets.prepayments;
  const currentLiabilities = liabs.shortTermFinancialDebt + liabs.relatedPartyShortTerm
    + liabs.tradePayables + liabs.otherCurrentLiabilities;

  const round = <T extends Record<string, number>>(o: T) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)])) as T;

  return {
    data: {
      period,
      months: monthsBetween(period.start, period.end),
      currency: "EUR",
      pnlAvailable: pnlTouched,
      balanceSheet: {
        assets: { ...round(assets), total: r2(totalAssets) },
        equityAndLiabilities: { ...round(liabs), currentYearResultIncluded: r2(currentYearResultIncluded), total: r2(totalEL) },
        imbalance,
      },
      incomeStatement: {
        ...round(pnl),
        interestExpense: r2(interestExpense),
        operatingResult: r2(operatingResult),
        ebitda: r2(ebitda),
        financialResult: r2(financialResult),
        preTaxResult: r2(preTaxResult),
        netIncome: r2(netIncome),
      },
      derived: {
        financialDebt: r2(financialDebt),
        netDebt: r2(financialDebt - assets.cash - assets.shortTermInvestments),
        workingCapital: r2(currentAssets - currentLiabilities),
        currentAssets: r2(currentAssets),
        currentLiabilities: r2(currentLiabilities),
      },
      lineage,
    },
    warnings,
  };
}

/** Aggregate raw account rows (e.g. 10-digit subaccounts) into LedgerBalance[] keyed by original account. */
export function aggregateByAccount(
  rows: { account: string | number; debit: number; credit: number; name?: string }[],
  source: LedgerBalance["source"],
  refFor: (account: string) => string,
): LedgerBalance[] {
  const map = new Map<string, LedgerBalance>();
  for (const r of rows) {
    const account = String(r.account);
    const cur = map.get(account) ?? {
      account, pgc3: toPgc3(account), name: r.name, debit: 0, credit: 0, source, sourceRef: refFor(account),
    };
    cur.debit += r.debit;
    cur.credit += r.credit;
    if (!cur.name && r.name) cur.name = r.name;
    map.set(account, cur);
  }
  return [...map.values()].sort((a, b) => a.account.localeCompare(b.account));
}
