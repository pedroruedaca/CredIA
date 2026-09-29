/** Balance-sheet structure as two proportional bars, each segment carrying the accounts behind it. Pure. */
import type { AssetLine, CanonicalStatement, LiabilityLine, LineContribution } from "../pgc/mapping.ts";

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
  assets: BalanceSegment[];
  liabilities: BalanceSegment[];
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

function build<L extends AssetLine | LiabilityLine>(specs: Spec<L>[], amounts: Record<L, number>, lineage: CanonicalStatement["lineage"]): BalanceSegment[] {
  const segs = specs.map((s) => ({
    id: s.id,
    label: s.label,
    short: s.short,
    tone: s.tone,
    value: Math.round(s.lines.reduce((sum, l) => sum + (amounts[l] ?? 0), 0) * 100) / 100,
    accounts: s.lines.flatMap((l) => lineage[l] ?? []).filter((c) => c.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    pct: 0,
  }));
  const drawnTotal = segs.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  for (const s of segs) s.pct = drawnTotal > 0 && s.value > 0 ? Math.round((s.value / drawnTotal) * 1000) / 10 : 0;
  return segs;
}

export function balanceBars(s: CanonicalStatement): BalanceBars {
  const assets = build(ASSETS, s.balanceSheet.assets, s.lineage);
  const liabilities = build(LIABILITIES, s.balanceSheet.equityAndLiabilities, s.lineage);
  return {
    total: s.balanceSheet.assets.total,
    assets: assets.filter((x) => x.pct > 0),
    liabilities: liabilities.filter((x) => x.pct > 0),
    notDrawn: [...assets, ...liabilities].filter((x) => x.value < 0),
  };
}
