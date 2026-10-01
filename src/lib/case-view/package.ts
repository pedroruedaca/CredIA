/**
 * Everything the case view, the exports and the PDF show, derived once from the loaded case. Pure.
 * No scores or recommendations: figures, comparisons and the sources behind them.
 */
import { DOC_KIND_LABEL } from "../../content/case-view.es.ts";
import { cirbeDrawnDebt } from "../checks/engine.ts";
import { formatDate } from "../format.ts";
import { caseSummary, type SummarySegment } from "../summary.ts";
import { balanceBars, type BalanceBars } from "./balance.ts";
import { checkSlugs, evidenceView, type EvidenceView } from "./evidence.ts";
import type { CaseViewData } from "./load.ts";
import { pnlSankey, type PnlSankey } from "./sankey.ts";
import { isFullStatement } from "../pgc/mapping.ts";
import type { PeriodChoice } from "./modules.ts";
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
  /** P&L of the same period as the balance, as a Sankey from income to result (not annualised). */
  pnl: PnlSankey | null;
  pnlPeriod: { start: string; end: string; months: number } | null;
  sources: SourceChip[];
  /** Evidence panels that could only show text or partial detail, for the report. */
  gaps: { check: string; gaps: string[] }[];
}

/**
 * Balance and P&L of one period, for the «Cuenta de resultados» and «Balance» modules: the base period (closed year
 * if there is one, else year to date) or a fixed one. Full statements only (not revenue-only Modelo 303 periods).
 */
export function periodView(d: CaseViewData, period: PeriodChoice): Pick<CasePackage, "balance" | "balanceDate" | "pnl" | "pnlPeriod"> {
  const closed = isFullStatement(d.statements.closed) ? d.statements.closed : null;
  const ytd = isFullStatement(d.statements.ytd) ? d.statements.ytd : null;
  const s = period === "closed" ? closed : period === "ytd" ? ytd : (closed ?? ytd);
  return {
    balance: s ? balanceBars(s) : null,
    balanceDate: s?.period.end ?? null,
    pnl: s ? pnlSankey(s) : null,
    pnlPeriod: s ? { start: s.period.start, end: s.period.end, months: s.months } : null,
  };
}

export function buildPackage(d: CaseViewData): CasePackage {
  const { closed: closedAny, ytd: ytdAny } = d.statements;
  // KPI tiles, balance and P&L need a full statement; revenue-only periods (Modelo 303) appear in the summary and tables.
  const closed = isFullStatement(closedAny) ? closedAny : null;
  const ytd = isFullStatement(ytdAny) ? ytdAny : null;
  const ctx = { closed, ytd, cirbe: d.cirbe };
  const withSlugs = checkSlugs(d.checks);
  const { open, passed } = splitChecks(withSlugs);
  const views = open.map((c) => {
    const v = evidenceView(c, ctx);
    const s = summariseSources(v.sources, d.documents, 8);
    return { ...v, review: d.reviews[c.slug] ?? null, sourceLabels: s.shown, moreSources: s.more };
  });

  const sources: SourceChip[] = [];
  if (d.holded) sources.push({ label: `Holded · ${d.holded.entries.toLocaleString("es-ES")} apuntes`, docId: null });
  if (d.registry.profile) sources.push({ label: `BORME · hoja ${d.registry.profile.sheet}`, docId: null });
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
    summary: caseSummary({ closed: closedAny, ytd: ytdAny, cirbe: d.cirbe, closedSource: d.statements.closedSource, ytdSource: d.statements.ytdSource }),
    tiles: kpiTiles(
      closed ? { statement: closed, kpis: d.kpis.closed } : null,
      ytd ? { statement: ytd, kpis: d.kpis.ytd } : null,
      d.cirbe ? cirbeDrawnDebt(d.cirbe) : null,
    ),
    basePeriod: closed ? "closed_fy" : ytd ? "ytd" : null,
    open: views,
    passed: passed.map((c) => evidenceView(c, ctx)),
    ...periodView(d, "base"),
    sources,
    gaps: views.filter((v) => v.gaps.length).map((v) => ({ check: v.name, gaps: v.gaps })),
  };
}
