/**
 * Balance sheet and P&L as pairs of proportional bars (assets vs equity + liabilities; income vs expenses +
 * result), each segment carrying the accounts behind it. Pure.
 */
import type { AssetLine, CanonicalStatement, ExpenseLine, IncomeLine, LiabilityLine, LineContribution } from "../pgc/mapping.ts";

export type SegmentTone = "asset-1" | "asset-2" | "asset-3" | "debt-1" | "debt-2" | "related" | "other";

export interface BalanceSegment {
  id: string;
  label: string;
  short: string;
  value: number;
  /** Share of the bar, 0–100. Zero when the value is not positive (it is listed, not drawn). */
  pct: number;
  tone: SegmentTone;
  accounts: LineContribution[];
}

export interface BalanceBars {
  total: number;
  /** Assets, or income. */
  top: BalanceSegment[];
  /** Equity and liabilities, or expenses and result. */
  bottom: BalanceSegment[];
  /** Segments that cannot be drawn (zero or negative), for a text note. */
  notDrawn: BalanceSegment[];
}

type Spec<L extends string> = { id: string; label: string; short: string; lines: L[]; tone: SegmentTone };

const ASSETS: Spec<AssetLine>[] = [
  { id: "fixed", label: "Inmovilizado", short: "Inmov.", lines: ["nonCurrentAssets"], tone: "asset-1" },
  { id: "inventories", label: "Existencias", short: "Exist.", lines: ["inventories"], tone: "asset-2" },
  { id: "receivables", label: "Clientes", short: "Clientes", lines: ["tradeReceivables"], tone: "asset-2" },
  { id: "otherAssets", label: "Otros activos corrientes", short: "Otros", lines: ["otherReceivables", "prepayments", "shortTermInvestments"], tone: "asset-2" },
  { id: "cash", label: "Tesorería", short: "Tesorería", lines: ["cash"], tone: "asset-3" },
];

const LIABILITIES: Spec<LiabilityLine>[] = [
  { id: "equity", label: "Patrimonio neto", short: "PN", lines: ["equity"], tone: "asset-1" },
  { id: "ltDebt", label: "Deuda financiera LP", short: "Deuda LP", lines: ["longTermFinancialDebt"], tone: "debt-1" },
  { id: "stDebt", label: "Deuda financiera CP", short: "Deuda CP", lines: ["shortTermFinancialDebt"], tone: "debt-2" },
  { id: "related", label: "Deudas con socios y vinculadas", short: "Soc.", lines: ["relatedPartyShortTerm"], tone: "related" },
  { id: "otherLiabilities", label: "Proveedores y otros", short: "Prov. y otros", lines: ["tradePayables", "otherCurrentLiabilities", "provisions", "longTermOtherLiabilities"], tone: "other" },
];

function build<L extends AssetLine | LiabilityLine | IncomeLine | ExpenseLine>(specs: Spec<L>[], amounts: Record<L, number>, lineage: CanonicalStatement["lineage"]): BalanceSegment[] {
  const segs = specs.map((s) => ({
    id: s.id,
    label: s.label,
    short: s.short,
    tone: s.tone,
    value: Math.round(s.lines.reduce((sum, l) => sum + (amounts[l] ?? 0), 0) * 100) / 100,
    accounts: s.lines.flatMap((l) => lineage[l] ?? []).filter((c) => c.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    pct: 0,
  }));
  return withPct(segs);
}

function withPct(segs: BalanceSegment[]): BalanceSegment[] {
  const drawnTotal = segs.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  for (const s of segs) s.pct = drawnTotal > 0 && s.value > 0 ? Math.round((s.value / drawnTotal) * 1000) / 10 : 0;
  return segs;
}

export function balanceBars(s: CanonicalStatement): BalanceBars {
  const assets = build(ASSETS, s.balanceSheet.assets, s.lineage);
  const liabilities = build(LIABILITIES, s.balanceSheet.equityAndLiabilities, s.lineage);
  return {
    total: s.balanceSheet.assets.total,
    top: assets.filter((x) => x.pct > 0),
    bottom: liabilities.filter((x) => x.pct > 0),
    notDrawn: [...assets, ...liabilities].filter((x) => x.value < 0),
  };
}

// ------------------------------------------------------------------------------------------------ P&L

const INCOME: Spec<IncomeLine>[] = [
  { id: "revenue", label: "Cifra de negocios", short: "Ventas", lines: ["revenue"], tone: "asset-3" },
  { id: "otherIncome", label: "Otros ingresos de explotación", short: "Otros", lines: ["otherOperatingIncome", "grantsTransferred"], tone: "asset-2" },
  { id: "financialIncome", label: "Ingresos financieros", short: "Fin.", lines: ["financialIncome"], tone: "asset-1" },
];

const EXPENSES: Spec<ExpenseLine>[] = [
  { id: "cogs", label: "Aprovisionamientos", short: "Aprov.", lines: ["cogs"], tone: "other" },
  { id: "personnel", label: "Gastos de personal", short: "Personal", lines: ["personnel"], tone: "related" },
  { id: "services", label: "Servicios exteriores y tributos", short: "Serv.", lines: ["externalServices", "otherTaxes", "otherOperatingExpenses"], tone: "debt-1" },
  { id: "depreciation", label: "Amortización y deterioros", short: "Amort.", lines: ["depreciation", "operatingImpairments"], tone: "asset-1" },
  { id: "financialExpense", label: "Gastos financieros", short: "Fin.", lines: ["financialExpense", "financialImpairments"], tone: "debt-2" },
  { id: "incomeTax", label: "Impuesto sobre beneficios", short: "Imp.", lines: ["incomeTax"], tone: "other" },
];

/**
 * Income on top; expenses plus the result below, so both bars add up to the same total. Non-recurring results
 * go to the side their sign puts them on; a loss sits on the income side, as what closes the gap.
 * Null when the period has no P&L.
 */
export function pnlBars(s: CanonicalStatement): BalanceBars | null {
  if (!s.pnlAvailable) return null;
  const is = s.incomeStatement;
  const income = build(INCOME, is, s.lineage);
  const expenses = build(EXPENSES, is, s.lineage);
  const nonRec = { id: "nonRecurring", label: "Resultados excepcionales", short: "Exc.", tone: "other" as SegmentTone, pct: 0, accounts: (s.lineage.nonRecurringResult ?? []).filter((c) => c.amount !== 0) };
  if (is.nonRecurringResult > 0) income.push({ ...nonRec, value: is.nonRecurringResult });
  if (is.nonRecurringResult < 0) expenses.push({ ...nonRec, value: -is.nonRecurringResult, accounts: nonRec.accounts.map((c) => ({ ...c, amount: -c.amount })) });
  const result = { pct: 0, accounts: [] as LineContribution[], value: Math.abs(is.netIncome) };
  if (is.netIncome >= 0) expenses.push({ ...result, id: "result", label: "Resultado del periodo", short: "Rdo.", tone: "asset-3" });
  else income.push({ ...result, id: "loss", label: "Pérdida del periodo", short: "Pérdida", tone: "debt-2" });
  const top = withPct(income).filter((x) => x.pct > 0);
  const bottom = withPct(expenses).filter((x) => x.pct > 0);
  return {
    total: top.reduce((sum, x) => sum + x.value, 0),
    top,
    bottom,
    notDrawn: [...income, ...expenses].filter((x) => x.value < 0),
  };
}
