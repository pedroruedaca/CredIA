/**
 * Everything the case view, the exports and the PDF show, derived once from the loaded case. Pure.
 * No scores or recommendations: figures, comparisons and the sources behind them.
 */
import { DOC_KIND_LABEL } from "../../content/case-view.es.ts";
import { cirbeDrawnDebt } from "../checks/engine.ts";
import { formatDate } from "../format.ts";
import { caseSummary, type SummarySegment } from "../summary.ts";
import { balanceBars, pnlBars, type BalanceBars } from "./balance.ts";
import { checkSlugs, evidenceView, type EvidenceView } from "./evidence.ts";
import type { CaseViewData } from "./load.ts";
import { kpiTiles, splitChecks, summariseSources, type KpiTile, type SourceLabel } from "./present.ts";

export interface SourceChip {
  label: string;
  docId: string | null;
}

export interface CasePackage {
  summary: SummarySegment[] | null;
  tiles: KpiTile[];
  basePeriod: "closed_fy" | "ytd" | null;
  open: (EvidenceView & { review: CaseViewData["reviews"][string] | null; sourceLabels: SourceLabel[]; moreSources: number })[];
  passed: EvidenceView[];
  balance: BalanceBars | null;
  balanceDate: string | null;
  /** P&L of the same period as the balance, as income vs expenses + result (not annualised). */
  pnl: BalanceBars | null;
  pnlPeriod: { start: string; end: string; months: number } | null;
  sources: SourceChip[];
  /** Evidence panels that could only show text or partial detail, for the report. */
  gaps: { check: string; gaps: string[] }[];
}

export function buildPackage(d: CaseViewData): CasePackage {
  const { closed, ytd } = d.statements;
  const ctx = { closed, ytd, cirbe: d.cirbe };
  const withSlugs = checkSlugs(d.checks);
  const { open, passed } = splitChecks(withSlugs);
  const views = open.map((c) => {
    const v = evidenceView(c, ctx);
    const s = summariseSources(v.sources, d.documents, 8);
    return { ...v, review: d.reviews[c.slug] ?? null, sourceLabels: s.shown, moreSources: s.more };
  });
  const base = closed ?? ytd;

  const sources: SourceChip[] = [];
  if (d.holded) sources.push({ label: `Holded · ${d.holded.entries.toLocaleString("es-ES")} apuntes`, docId: null });
  const usable = d.documents.filter((x) => x.status !== "failed");
  const byKind = new Map<string, typeof usable>();
  for (const doc of usable) byKind.set(doc.kind, [...(byKind.get(doc.kind) ?? []), doc]);
  for (const [kind, docs] of byKind) {
    docs.forEach((doc, i) => {
      const when = doc.issued_on ? ` ${formatDate(doc.issued_on)}` : "";
      const n = docs.length > 1 ? ` · ${i + 1}/${docs.length}` : "";
      sources.push({ label: `${DOC_KIND_LABEL[kind] ?? "Documento"}${when}${n}`, docId: doc.id });
    });
  }

  return {
    summary: caseSummary(ctx),
    tiles: kpiTiles(
      closed ? { statement: closed, kpis: d.kpis.closed } : null,
      ytd ? { statement: ytd, kpis: d.kpis.ytd } : null,
      d.cirbe ? cirbeDrawnDebt(d.cirbe) : null,
    ),
    basePeriod: closed ? "closed_fy" : ytd ? "ytd" : null,
    open: views,
    passed: passed.map((c) => evidenceView(c, ctx)),
    balance: base ? balanceBars(base) : null,
    balanceDate: base?.period.end ?? null,
    pnl: base ? pnlBars(base) : null,
    pnlPeriod: base ? { start: base.period.start, end: base.period.end, months: base.months } : null,
    sources,
    gaps: views.filter((v) => v.gaps.length).map((v) => ({ check: v.name, gaps: v.gaps })),
  };
}
