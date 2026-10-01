/**
 * Statements from tax returns, for periods with no trial balance, Holded ledger or cuentas anuales. Pure.
 *
 *  - Modelo 200: its balance sheet and profit and loss pages follow the official accounts model, so the closed year is
 *    built exactly as from the cuentas anuales (statementFromAnnualAccounts), with `m200_*` warnings.
 *  - Modelo 303: only sales. The statement has `scope: "revenue"` and `pnlAvailable: false`: revenue is known, every
 *    other line is unknown (not zero), and consumers that need the balance sheet or the full P&L skip it.
 */
import type { Modelo200Extraction } from "../schema/canonical.ts";
import { declaredSales, returnLabel, returnsForPeriod, type M303Return } from "../tax/modelo303.ts";
import type { Period, Warning } from "../types.ts";
import { statementFromAnnualAccounts } from "./annual-accounts.ts";
import { assembleStatement, ASSET_LINES, EXPENSE_LINES, INCOME_LINES, LIAB_LINES, zero, type CanonicalStatement } from "./mapping.ts";

export const MODELO200_SOURCE = "modelo200" as const;
export const MODELO303_SOURCE = "modelo303" as const;

/** Closed-year period of a Modelo 200: printed closing date (or the case's) and its length. */
export function modelo200Period(m: Modelo200Extraction, caseFiscalYearEnd: string | null): Period | null {
  const end = m.statement?.periodEnd ?? caseFiscalYearEnd ?? (m.fiscalYear > 0 ? `${m.fiscalYear}-12-31` : null);
  if (!end || !m.statement) return null;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCMonth(d.getUTCMonth() - m.statement.months);
  return { kind: "closed_fy", start: d.toISOString().slice(0, 10), end };
}

export function statementFromModelo200(m: Modelo200Extraction, docId: string, period: Period): { data: CanonicalStatement; warnings: Warning[] } | null {
  if (!m.statement) return null;
  return statementFromAnnualAccounts(m.statement, docId, period, m.statement.current, { codePrefix: "m200", name: "el Modelo 200" });
}

/** Revenue-only statement from the Modelo 303 returns covering `period` (every month); null if any month is missing. */
export function statementFromModelo303(returns: M303Return[], period: Period): CanonicalStatement | null {
  const { used, complete } = returnsForPeriod(returns, period.start, period.end);
  if (!complete || used.length === 0) return null;
  const pnl = { ...zero(INCOME_LINES), ...zero(EXPENSE_LINES) };
  const lineage: CanonicalStatement["lineage"] = { revenue: [] };
  for (const r of used) {
    const sales = declaredSales(r.data);
    pnl.revenue += sales;
    lineage.revenue!.push({ account: `Modelo 303 ${returnLabel(r.data)} · ventas declaradas`, amount: sales, sourceRef: `doc:${r.docId}${r.data.page ? `:page:${r.data.page}` : ""}` });
  }
  const s = assembleStatement({ period, assets: zero(ASSET_LINES), liabs: zero(LIAB_LINES), pnl, interestExpense: 0, lineage, pnlAvailable: false, currentYearResultIncluded: 0 });
  return { ...s, scope: "revenue" };
}
