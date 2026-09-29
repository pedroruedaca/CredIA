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
  if (den === 0) return { value: null, note: "El denominador es cero" };
  if (den < 0 && !opts.allowNegativeDen) return { value: null, note: "El denominador es negativo; el ratio no es significativo" };
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
    ? `Principal según ${opts.annualPrincipalSource ?? "el calendario aportado"}`
    : "Principal = toda la deuda financiera a corto plazo (criterio conservador; se sustituye por el calendario CIRBE cuando está disponible)";

  const kpis: Kpi[] = [];
  const add = (k: Omit<Kpi, "value"> & { value: number | null }) => kpis.push(k);
  const annNote = s.months !== 12 ? `Flujos anualizados desde ${s.months} meses` : undefined;
  const joinNotes = (...n: (string | undefined)[]) => n.filter(Boolean).join(". ") || undefined;

  if (!s.pnlAvailable) {
    for (const key of ["revenue", "ebitda", "ebitdaMargin", "netDebtToEbitda", "interestCoverage", "dscr", "dso", "dpo"] as KpiKey[]) {
      add({ key, value: null, unit: key === "ebitdaMargin" ? "%" : key === "dso" || key === "dpo" ? "days" : key === "revenue" || key === "ebitda" ? "EUR" : "x", formula: "—", inputs: {}, note: "Sin cuenta de resultados para este periodo" });
    }
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
  }

  const cr = ratio(d.currentAssets, d.currentLiabilities);
  add({ key: "currentRatio", value: cr.value, unit: "x", formula: "activo corriente / pasivo corriente", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities }, note: cr.note });
  const qr = ratio(d.currentAssets - a.inventories, d.currentLiabilities);
  add({ key: "quickRatio", value: qr.value, unit: "x", formula: "(activo corriente − existencias) / pasivo corriente", inputs: { currentAssets: d.currentAssets, inventories: a.inventories, currentLiabilities: d.currentLiabilities }, note: qr.note });
  add({ key: "workingCapital", value: d.workingCapital, unit: "EUR", formula: "activo corriente − pasivo corriente", inputs: { currentAssets: d.currentAssets, currentLiabilities: d.currentLiabilities } });
  add({ key: "financialDebt", value: d.financialDebt, unit: "EUR", formula: "16x+17x (sin 172/173) + 50x+51x+52x (sin 522/523/526/529) + 57x en descubierto", inputs: { longTerm: l.longTermFinancialDebt, shortTerm: l.shortTermFinancialDebt }, note: l.relatedPartyShortTerm ? `Excluye ${l.relatedPartyShortTerm} € de cuentas corrientes con socios y vinculadas (55x), que se muestran aparte` : undefined });
  add({ key: "netDebt", value: d.netDebt, unit: "EUR", formula: "deuda financiera − tesorería (57) − inversiones a corto plazo (53/54/56)", inputs: { financialDebt: d.financialDebt, cash: a.cash, shortTermInvestments: a.shortTermInvestments } });
  const de = ratio(d.financialDebt, l.equity);
  add({ key: "debtToEquity", value: de.value, unit: "x", formula: "deuda financiera / patrimonio neto", inputs: { financialDebt: d.financialDebt, equity: l.equity }, note: l.equity < 0 ? "Patrimonio neto negativo: revisar posible causa de disolución (art. 363 LSC)" : de.note });

  return kpis;
}
