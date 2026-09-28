/**
 * Orchestrates a Holded pull for one case: closed fiscal year + current YTD → statements + KPIs.
 * Pure with respect to the database: returns everything the caller needs to persist.
 */
import type { Period, Warning } from "../types.ts";
import { buildStatement, type CanonicalStatement } from "../pgc/mapping.ts";
import { computeKpis, type Kpi } from "../kpis/engine.ts";
import { HoldedClient, pullHoldedTrialBalance, applyAccountNames, reconcileWithChart, type HoldedTrialBalance, type EntryClassifierConfig } from "./holded.ts";

export interface HoldedSyncPeriodResult {
  period: Period;
  trialBalance: HoldedTrialBalance;
  statement: CanonicalStatement;
  kpis: Kpi[];
  warnings: Warning[];
}

export interface HoldedSyncResult {
  periods: HoldedSyncPeriodResult[];
  requestCount: number;
}

/** Closed FY from the case's fiscal_year_end; YTD from the following day to `today` (skipped if < 1 month). */
export function periodsFor(fiscalYearEnd: string, today: string): Period[] {
  const end = new Date(fiscalYearEnd + "T00:00:00Z");
  const start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 1); start.setUTCDate(start.getUTCDate() + 1);
  const ytdStart = new Date(end); ytdStart.setUTCDate(ytdStart.getUTCDate() + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const periods: Period[] = [{ kind: "closed_fy", start: iso(start), end: fiscalYearEnd }];
  const days = (new Date(today + "T00:00:00Z").getTime() - ytdStart.getTime()) / 86_400_000;
  if (days >= 28) periods.push({ kind: "ytd", start: iso(ytdStart), end: today });
  return periods;
}

export async function runHoldedSync(
  client: HoldedClient,
  opts: { fiscalYearEnd: string; today: string; classifier?: EntryClassifierConfig; vatRate?: number },
): Promise<HoldedSyncResult> {
  const results: HoldedSyncPeriodResult[] = [];
  for (const period of periodsFor(opts.fiscalYearEnd, opts.today)) {
    const { data: tb, warnings: pullWarnings } = await pullHoldedTrialBalance(client, period, {
      classifier: opts.classifier,
      fiscalYearStart: period.start,
    });
    const chart = await client.listAccounts({ startDate: period.start, endDate: period.end });
    tb.balances = applyAccountNames(tb.balances, chart);
    const { data: statement, warnings: stmtWarnings } = buildStatement(tb.balances, period);
    const kpis = computeKpis(statement, { vatRate: opts.vatRate });
    results.push({
      period, trialBalance: tb, statement, kpis,
      warnings: [...pullWarnings, ...stmtWarnings, ...reconcileWithChart(tb.balances, chart)],
    });
  }
  return { periods: results, requestCount: client.requestCount };
}

/** Map engine warnings to `checks.severity`. Unknown codes default to "info". */
export const WARNING_SEVERITY: Record<string, "info" | "warn" | "high"> = {
  holded_closing_entries_suspected: "high",
  holded_tb_unbalanced: "high",
  balance_sheet_imbalance: "high",
  pnl_unavailable: "warn",
  unmapped_account: "warn",
  overdrawn_bank_account: "warn",
  holded_no_entries: "warn",
  holded_opening_reconstructed: "info",
  holded_chart_mismatch: "info",
};
