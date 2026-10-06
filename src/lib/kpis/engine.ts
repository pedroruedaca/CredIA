/**
 * KPI engine. Pure functions over a CanonicalStatement. No scoring, no thresholds that imply a
 * credit decision: the lender interprets. Each KPI exposes its formula and inputs for drill-down.
 */
import type { CanonicalStatement } from "../pgc/mapping.ts";
import type { BankKpiKey } from "./bank.ts";
import type { CostKpiKey } from "./cost-of-sales.ts";

export type KpiKey =
  | "revenue" | "ebitda" | "ebitdaMargin" | "currentRatio" | "quickRatio" | "workingCapital"
  | "financialDebt" | "netDebt" | "netDebtToEbitda" | "debtToEquity" | "interestCoverage"
  | "dscr" | "dso" | "dpo"
  // added with the accounting KPI catalogue
  | "ebitCoverage" | "debtToEbitda" | "liabilitiesToEquity" | "grossMargin" | "netMargin" | "roa" | "roe" | "dio" | "ccc"
  | "assetTurnover";

export interface Kpi {
  /** Accounting KPIs (this file) or bank KPIs read from the bank movements (bank.ts). */
  key: KpiKey | BankKpiKey | CostKpiKey;
  value: number | null;
  unit: "EUR" | "x" | "%" | "days" | "count";
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
  if (den === 0) return { value: null, note: "El denominador es cero" };
  if (den < 0 && !opts.allowNegativeDen) return { value: null, note: "El denominador es negativo; el ratio no es significativo" };
  return { value: r(num / den) };
}

/** Unit of every accounting KPI; its keys are the full list computeKpis returns. */
export const UNIT: Record<KpiKey, Kpi["unit"]> = {
  revenue: "EUR", ebitda: "EUR", ebitdaMargin: "%", currentRatio: "x", quickRatio: "x", workingCapital: "EUR", financialDebt: "EUR",
  netDebt: "EUR", netDebtToEbitda: "x", debtToEquity: "x", interestCoverage: "x", dscr: "x", dso: "days", dpo: "days",
  ebitCoverage: "x", debtToEbitda: "x", liabilitiesToEquity: "x", grossMargin: "%", netMargin: "%", roa: "%", roe: "%", dio: "days", ccc: "days",
  assetTurnover: "x",
};

/** KPIs that need the P&L (null with a note when a period has only the balance sheet). */
const PNL_KPIS: KpiKey[] = [
  "revenue", "ebitda", "ebitdaMargin", "netDebtToEbitda", "interestCoverage", "dscr", "dso", "dpo",
  "ebitCoverage", "debtToEbitda", "grossMargin", "netMargin", "roa", "roe", "dio", "ccc", "assetTurnover",
];

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
    ? `Principal según ${opts.annualPrincipalSource ?? "el calendario aportado"}`
    : "Principal = toda la deuda financiera a corto plazo (criterio conservador; se sustituye por el calendario CIRBE cuando está disponible)";

  const kpis: Kpi[] = [];
  const add = (k: Omit<Kpi, "value"> & { value: number | null }) => kpis.push(k);
  const annNote = s.months !== 12 ? `Flujos anualizados desde ${s.months} meses` : undefined;
  const joinNotes = (...n: (string | undefined)[]) => n.filter(Boolean).join(". ") || undefined;

  if (s.scope === "revenue") {
    // Sales declared in the Modelo 303: revenue is known, nothing else is.
    const note = "Solo hay ventas declaradas en IVA (Modelo 303) para este periodo";
    const kpis: Kpi[] = [{ key: "revenue", value: r(revenueA), unit: "EUR", formula: "Σ ventas declaradas en Modelo 303 × 12/meses", inputs: { revenue: is.revenue, months: s.months }, note: joinNotes(annNote, "Ventas declaradas en IVA, no la cifra de negocios contable") }];
    for (const key of (Object.keys(UNIT) as KpiKey[]).filter((k) => k !== "revenue")) {
      kpis.push({ key, value: null, unit: UNIT[key], formula: "—", inputs: {}, note });
    }
    return kpis;
  }

  if (!s.pnlAvailable) {
    for (const key of PNL_KPIS) add({ key, value: null, unit: UNIT[key], formula: "—", inputs: {}, note: "Sin cuenta de resultados para este periodo" });
  } else {
    add({ key: "revenue", value: r(revenueA), unit: "EUR", formula: "Σ grupo 70 × 12/meses", inputs: { revenue: is.revenue, months: s.months }, note: annNote });
    add({ key: "ebitda", value: r(ebitdaA), unit: "EUR", formula: "(resultado de explotación + 68 + deterioros de explotación − 67/77 − 746) × 12/meses", inputs: { operatingResult: is.operatingResult, depreciation: is.depreciation, operatingImpairments: is.operatingImpairments, nonRecurringResult: is.nonRecurringResult, grantsTransferred: is.grantsTransferred, months: s.months }, note: annNote });
    const m = ratio(is.ebitda, is.revenue);
    add({ key: "ebitdaMargin", value: m.value === null ? null : r(m.value * 100, 1), unit: "%", formula: "EBITDA / cifra de negocios", inputs: { ebitda: is.ebitda, revenue: is.revenue }, note: m.note });
    const nd = ratio(d.netDebt, ebitdaA);
    add({ key: "netDebtToEbitda", value: nd.value, unit: "x", formula: "deuda financiera neta / EBITDA anualizado", inputs: { netDebt: d.netDebt, ebitdaAnnualised: r(ebitdaA) }, note: joinNotes(nd.note, ebitdaA < 0 ? "EBITDA negativo" : undefined) });
    const ic = ratio(ebitdaA, interestA);
    add({ key: "interestCoverage", value: ic.value, unit: "x", formula: "EBITDA anualizado / intereses anualizados (661+662+665)", inputs: { ebitdaAnnualised: r(ebitdaA), interestAnnualised: r(interestA) }, note: ic.note === "El denominador es cero" ? "Sin gasto por intereses registrado" : ic.note });
    const ds = ratio(ebitdaA, interestA + principal);
    add({ key: "dscr", value: ds.value, unit: "x", formula: "EBITDA anualizado / (intereses anualizados + principal a 12 meses)", inputs: { ebitdaAnnualised: r(ebitdaA), interestAnnualised: r(interestA), principal: r(principal) }, note: joinNotes(ds.note, principalNote) });
    const dso = ratio(a.tradeReceivables * 365, revenueA * (1 + vat));
    add({ key: "dso", value: dso.value === null ? null : r(dso.value, 0), unit: "days", formula: "clientes / (ventas anualizadas × (1+IVA)) × 365", inputs: { tradeReceivables: a.tradeReceivables, revenueAnnualised: r(revenueA), vatRate: vat }, note: dso.note });
    const dpo = ratio(l.tradePayables * 365, purchasesA * (1 + vat));
    add({ key: "dpo", value: dpo.value === null ? null : r(dpo.value, 0), unit: "days", formula: "proveedores / (compras anualizadas (60+61+62) × (1+IVA)) × 365", inputs: { tradePayables: l.tradePayables, purchasesAnnualised: r(purchasesA), vatRate: vat }, note: joinNotes(dpo.note, "Proveedores = saldos acreedores de 40/41; sin proveedores de inmovilizado (173/523)") });

    // Coverage and leverage on other bases than the ones above.
    const ebitA = is.operatingResult * af;
    const tie = ratio(ebitA, interestA);
    add({ key: "ebitCoverage", value: tie.value, unit: "x", formula: "resultado de explotación (EBIT) anualizado / intereses anualizados (661+662+665)", inputs: { operatingResultAnnualised: r(ebitA), interestAnnualised: r(interestA) }, note: tie.note === "El denominador es cero" ? "Sin gasto por intereses registrado" : joinNotes(tie.note, "Tras amortizaciones; la cobertura «Cobertura int.» usa el EBITDA") });
    const gd = ratio(d.financialDebt, ebitdaA);
    add({ key: "debtToEbitda", value: gd.value, unit: "x", formula: "deuda financiera (bruta, sin restar tesorería) / EBITDA anualizado", inputs: { financialDebt: d.financialDebt, ebitdaAnnualised: r(ebitdaA) }, note: joinNotes(gd.note, ebitdaA < 0 ? "EBITDA negativo" : undefined) });

    // Margins and returns.
    const grossProfit = is.revenue - is.cogs;
    const gm = ratio(grossProfit, is.revenue);
    add({ key: "grossMargin", value: gm.value === null ? null : r((grossProfit / is.revenue) * 100, 1), unit: "%", formula: "(cifra de negocios − aprovisionamientos (60+61)) / cifra de negocios", inputs: { revenue: is.revenue, cogs: is.cogs }, note: joinNotes(gm.note, "Aprovisionamientos: compras y variación de existencias; el personal y los servicios exteriores quedan fuera") });
    const nm = ratio(is.netIncome, is.revenue);
    add({ key: "netMargin", value: nm.value === null ? null : r((is.netIncome / is.revenue) * 100, 1), unit: "%", formula: "resultado del periodo / cifra de negocios", inputs: { netIncome: is.netIncome, revenue: is.revenue }, note: nm.note });
    const netIncomeA = is.netIncome * af;
    const roa = ratio(netIncomeA, a.total);
    add({ key: "roa", value: roa.value === null ? null : r((netIncomeA / a.total) * 100, 1), unit: "%", formula: "resultado anualizado / activo total al cierre", inputs: { netIncomeAnnualised: r(netIncomeA), totalAssets: a.total }, note: joinNotes(roa.note, annNote) });
    const roe = ratio(netIncomeA, l.equity);
    add({ key: "roe", value: roe.value === null ? null : r((netIncomeA / l.equity) * 100, 1), unit: "%", formula: "resultado anualizado / patrimonio neto al cierre", inputs: { netIncomeAnnualised: r(netIncomeA), equity: l.equity }, note: joinNotes(l.equity < 0 ? "Patrimonio neto negativo: ratio no significativo" : roe.note, "El patrimonio al cierre ya incluye el resultado del periodo", annNote) });

    // Working capital cycle: inventory days, then DSO + DIO − DPO with the rounded days shown above.
    const cogsA = is.cogs * af;
    const dio = a.inventories === 0 ? { value: 0 } : ratio(a.inventories * 365, cogsA);
    add({ key: "dio", value: dio.value === null ? null : r(dio.value, 0), unit: "days", formula: "existencias / aprovisionamientos anualizados × 365", inputs: { inventories: a.inventories, cogsAnnualised: r(cogsA) }, note: a.inventories === 0 ? "Sin existencias en balance" : dio.note });
    const days = [dso, dio, dpo].map((x) => (x.value === null ? null : r(x.value, 0)));
    add({
      key: "ccc",
      value: days.some((x) => x === null) ? null : days[0]! + days[1]! - days[2]!,
      unit: "days",
      formula: "DSO + DIO − DPO",
      inputs: days.some((x) => x === null) ? {} : { dsoDays: days[0]!, dioDays: days[1]!, dpoDays: days[2]! },
      note: days.some((x) => x === null) ? "Falta DSO, DIO o DPO" : undefined,
    });
    const at = ratio(revenueA, a.total);
    add({ key: "assetTurnover", value: at.value, unit: "x", formula: "cifra de negocios anualizada / activo total al cierre", inputs: { revenueAnnualised: r(revenueA), totalAssets: a.total }, note: joinNotes(at.note, annNote) });
  }

  const cr = ratio(d.currentAssets, d.currentLiabilities);
  add({ key: "currentRatio", value: cr.value, unit: "x", formula: "activo corriente / pasivo corriente", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities }, note: cr.note });
  const qr = ratio(d.currentAssets - a.inventories, d.currentLiabilities);
  add({ key: "quickRatio", value: qr.value, unit: "x", formula: "(activo corriente − existencias) / pasivo corriente", inputs: { currentAssets: d.currentAssets, inventories: a.inventories, currentLiabilities: d.currentLiabilities }, note: qr.note });
  add({ key: "workingCapital", value: d.workingCapital, unit: "EUR", formula: "activo corriente − pasivo corriente", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities } });
  add({ key: "financialDebt", value: d.financialDebt, unit: "EUR", formula: "16x+17x (sin 172/173) + 50x+51x+52x (sin 522/523/526/529) + 57x en descubierto", inputs: { longTerm: l.longTermFinancialDebt, shortTerm: l.shortTermFinancialDebt }, note: l.relatedPartyShortTerm ? `Excluye ${l.relatedPartyShortTerm} € de cuentas corrientes con socios y vinculadas (55x), que se muestran aparte` : undefined });
  add({ key: "netDebt", value: d.netDebt, unit: "EUR", formula: "deuda financiera − tesorería (57) − inversiones a corto plazo (53/54/56)", inputs: { financialDebt: d.financialDebt, cash: a.cash, shortTermInvestments: a.shortTermInvestments } });
  const de = ratio(d.financialDebt, l.equity);
  const totalLiabilities = l.total - l.equity;
  const le = ratio(totalLiabilities, l.equity);
  add({ key: "liabilitiesToEquity", value: le.value, unit: "x", formula: "pasivo total (exigible) / patrimonio neto", inputs: { totalLiabilities: r(totalLiabilities), equity: l.equity }, note: l.equity < 0 ? "Patrimonio neto negativo: revisar posible causa de disolución (art. 363 LSC)" : joinNotes(le.note, "Todo el exigible: deuda financiera, proveedores, provisiones y demás; «Deuda / patrimonio» solo cuenta la deuda financiera") });
  add({ key: "debtToEquity", value: de.value, unit: "x", formula: "deuda financiera / patrimonio neto", inputs: { financialDebt: d.financialDebt, equity: l.equity }, note: l.equity < 0 ? "Patrimonio neto negativo: revisar posible causa de disolución (art. 363 LSC)" : de.note });

  return kpis;
}
