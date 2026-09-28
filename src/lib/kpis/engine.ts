/**
 * KPI engine. Pure functions over a CanonicalStatement. No scoring, no thresholds that imply a
 * credit decision: the lender interprets. Each KPI exposes its formula and inputs for drill-down.
 */
import type { CanonicalStatement } from "../pgc/mapping.ts";

export type KpiKey =
  | "revenue" | "ebitda" | "ebitdaMargin" | "currentRatio" | "quickRatio" | "workingCapital"
  | "financialDebt" | "netDebt" | "netDebtToEbitda" | "debtToEquity" | "interestCoverage"
  | "dscr" | "dso" | "dpo";

export interface Kpi {
  key: KpiKey;
  value: number | null;
  unit: "EUR" | "x" | "%" | "days";
  formula: string;
  inputs: Record<string, number>;
  note?: string;
}

export interface KpiOptions {
  /** VAT rate used to gross up revenue/purchases for DSO/DPO (balances include VAT, P&L does not). */
  vatRate?: number;
  /**
   * Principal due in the next 12 months. Prefer the CIRBE maturity schedule.
   * Default: all short-term financial debt (conservative — credit lines usually roll over).
   */
  annualPrincipal?: number;
  annualPrincipalSource?: string;
}

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function ratio(num: number, den: number, opts: { allowNegativeDen?: boolean } = {}): { value: number | null; note?: string } {
  if (den === 0) return { value: null, note: "Denominator is zero" };
  if (den < 0 && !opts.allowNegativeDen) return { value: null, note: "Denominator is negative; ratio not meaningful" };
  return { value: r(num / den) };
}

export function computeKpis(s: CanonicalStatement, opts: KpiOptions = {}): Kpi[] {
  const vat = opts.vatRate ?? 0.21;
  const af = 12 / s.months; // annualisation factor for flows
  const is = s.incomeStatement;
  const a = s.balanceSheet.assets;
  const l = s.balanceSheet.equityAndLiabilities;
  const d = s.derived;

  const revenueA = is.revenue * af;
  const ebitdaA = is.ebitda * af;
  const interestA = is.interestExpense * af;
  const purchasesA = (is.cogs + is.externalServices) * af;
  const principal = opts.annualPrincipal ?? l.shortTermFinancialDebt;
  const principalNote = opts.annualPrincipal !== undefined
    ? `Principal from ${opts.annualPrincipalSource ?? "provided schedule"}`
    : "Principal = all short-term financial debt (conservative; replace with CIRBE schedule when available)";

  const kpis: Kpi[] = [];
  const add = (k: Omit<Kpi, "value"> & { value: number | null }) => kpis.push(k);
  const annNote = s.months !== 12 ? `Flows annualised from ${s.months} months` : undefined;
  const joinNotes = (...n: (string | undefined)[]) => n.filter(Boolean).join(". ") || undefined;

  if (!s.pnlAvailable) {
    for (const key of ["revenue", "ebitda", "ebitdaMargin", "netDebtToEbitda", "interestCoverage", "dscr", "dso", "dpo"] as KpiKey[]) {
      add({ key, value: null, unit: key === "ebitdaMargin" ? "%" : key === "dso" || key === "dpo" ? "days" : key === "revenue" || key === "ebitda" ? "EUR" : "x", formula: "—", inputs: {}, note: "Income statement not available for this period" });
    }
  } else {
    add({ key: "revenue", value: r(revenueA), unit: "EUR", formula: "Σ group 70 × 12/months", inputs: { revenue: is.revenue, months: s.months }, note: annNote });
    add({ key: "ebitda", value: r(ebitdaA), unit: "EUR", formula: "(operating result + 68 + net operating impairments − 67/77 − 746) × 12/months", inputs: { operatingResult: is.operatingResult, depreciation: is.depreciation, operatingImpairments: is.operatingImpairments, nonRecurringResult: is.nonRecurringResult, grantsTransferred: is.grantsTransferred, months: s.months }, note: annNote });
    const m = ratio(is.ebitda, is.revenue);
    add({ key: "ebitdaMargin", value: m.value === null ? null : r(m.value * 100, 1), unit: "%", formula: "EBITDA / revenue", inputs: { ebitda: is.ebitda, revenue: is.revenue }, note: m.note });
    const nd = ratio(d.netDebt, ebitdaA);
    add({ key: "netDebtToEbitda", value: nd.value, unit: "x", formula: "net debt / annualised EBITDA", inputs: { netDebt: d.netDebt, ebitdaAnnualised: r(ebitdaA) }, note: joinNotes(nd.note, ebitdaA < 0 ? "Negative EBITDA" : undefined) });
    const ic = ratio(ebitdaA, interestA);
    add({ key: "interestCoverage", value: ic.value, unit: "x", formula: "annualised EBITDA / annualised interest (661+662+665)", inputs: { ebitdaAnnualised: r(ebitdaA), interestAnnualised: r(interestA) }, note: ic.note === "Denominator is zero" ? "No interest expense recorded" : ic.note });
    const ds = ratio(ebitdaA, interestA + principal);
    add({ key: "dscr", value: ds.value, unit: "x", formula: "annualised EBITDA / (annualised interest + principal due 12m)", inputs: { ebitdaAnnualised: r(ebitdaA), interestAnnualised: r(interestA), principal: r(principal) }, note: joinNotes(ds.note, principalNote) });
    const dso = ratio(a.tradeReceivables * 365, revenueA * (1 + vat));
    add({ key: "dso", value: dso.value === null ? null : r(dso.value, 0), unit: "days", formula: "trade receivables / (annualised revenue × (1+VAT)) × 365", inputs: { tradeReceivables: a.tradeReceivables, revenueAnnualised: r(revenueA), vatRate: vat }, note: dso.note });
    const dpo = ratio(l.tradePayables * 365, purchasesA * (1 + vat));
    add({ key: "dpo", value: dpo.value === null ? null : r(dpo.value, 0), unit: "days", formula: "trade payables / (annualised (60+61+62) × (1+VAT)) × 365", inputs: { tradePayables: l.tradePayables, purchasesAnnualised: r(purchasesA), vatRate: vat }, note: joinNotes(dpo.note, "Payables = credit balances in 40/41; fixed-asset suppliers (173/523) excluded") });
  }

  const cr = ratio(d.currentAssets, d.currentLiabilities);
  add({ key: "currentRatio", value: cr.value, unit: "x", formula: "current assets / current liabilities", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities }, note: cr.note });
  const qr = ratio(d.currentAssets - a.inventories, d.currentLiabilities);
  add({ key: "quickRatio", value: qr.value, unit: "x", formula: "(current assets − inventories) / current liabilities", inputs: { currentAssets: d.currentAssets, inventories: a.inventories, currentLiabilities: d.currentLiabilities }, note: qr.note });
  add({ key: "workingCapital", value: d.workingCapital, unit: "EUR", formula: "current assets − current liabilities", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities } });
  add({ key: "financialDebt", value: d.financialDebt, unit: "EUR", formula: "16x+17x (excl. 172/173) + 50x+51x+52x (excl. 522/523/526/529) + overdrawn 57x", inputs: { longTerm: l.longTermFinancialDebt, shortTerm: l.shortTermFinancialDebt }, note: l.relatedPartyShortTerm ? `Excludes ${l.relatedPartyShortTerm} € of shareholder/related-party current accounts (55x), shown separately` : undefined });
  add({ key: "netDebt", value: d.netDebt, unit: "EUR", formula: "financial debt − cash (57) − short-term investments (53/54/56)", inputs: { financialDebt: d.financialDebt, cash: a.cash, shortTermInvestments: a.shortTermInvestments } });
  const de = ratio(d.financialDebt, l.equity);
  add({ key: "debtToEquity", value: de.value, unit: "x", formula: "financial debt / equity", inputs: { financialDebt: d.financialDebt, equity: l.equity }, note: l.equity < 0 ? "Negative equity (patrimonio neto negativo) — check causa de disolución (art. 363 LSC)" : de.note });

  return kpis;
}
