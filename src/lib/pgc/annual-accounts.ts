/**
 * Cuentas anuales (official model: normal, abreviado, PYMES) → canonical statement, for a closed year with no trial
 * balance or Holded ledger. Pure. The model's headings map onto the same canonical lines as the PGC account mapping
 * (mapping.ts), and the subtotals are computed by the same `assembleStatement`, so KPIs and checks read it alike.
 *
 * The model is coarser than a trial balance: every line keeps the page it was read from (source_ref
 * `doc:<id>:page:<n>`), lines the extraction does not name are reconciled against the printed totals (residuals go
 * to the "other" line of their block, with a warning when they are material), and a printed total that does not add
 * up is flagged. Signs follow the model: expenses are printed negative and become positive canonical expenses.
 */
import type { AccountsYear, AnnualAccountsExtraction } from "../schema/canonical.ts";
import type { Period, Warning } from "../types.ts";
import {
  assembleStatement,
  ASSET_LINES,
  EXPENSE_LINES,
  INCOME_LINES,
  LIAB_LINES,
  zero,
  type CanonicalStatement,
  type Line,
} from "./mapping.ts";

/** Differences up to this are rounding in the printed model (whole euros). */
const TOLERANCE = 2;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eurText = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} €`;

export const ANNUAL_ACCOUNTS_SOURCE = "annual_accounts" as const;

export function statementFromAnnualAccounts(
  a: AnnualAccountsExtraction,
  docId: string,
  period: Period,
  year: AccountsYear = a.current,
): { data: CanonicalStatement; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const bsRef = `doc:${docId}${a.pages.balanceSheet ? `:page:${a.pages.balanceSheet}` : ""}`;
  const plRef = `doc:${docId}${a.pages.incomeStatement ? `:page:${a.pages.incomeStatement}` : ""}`;
  const assets = zero(ASSET_LINES);
  const liabs = zero(LIAB_LINES);
  const pnl = { ...zero(INCOME_LINES), ...zero(EXPENSE_LINES) };
  const lineage: CanonicalStatement["lineage"] = {};
  const add = (target: Record<string, number>, line: Line, label: string, amount: number, ref: string) => {
    if (Math.abs(amount) < 0.005) return;
    target[line] += amount;
    (lineage[line] ??= []).push({ account: label, amount: r2(amount), sourceRef: ref });
  };
  const y = year;

  // --- Activo
  add(assets, "nonCurrentAssets", "Activo no corriente", y.nonCurrentAssets, bsRef);
  add(assets, "inventories", "Existencias", y.inventories, bsRef);
  // Abbreviated models may not split customers out; the whole heading is then trade receivables.
  const customers = y.customers > 0 ? y.customers : y.tradeAndOtherReceivables;
  add(assets, "tradeReceivables", "Clientes por ventas y prestaciones de servicios", customers, bsRef);
  add(assets, "otherReceivables", "Otros deudores", y.tradeAndOtherReceivables - customers, bsRef);
  add(assets, "shortTermInvestments", "Inversiones financieras a corto plazo", y.shortTermInvestments, bsRef);
  add(assets, "prepayments", "Periodificaciones a corto plazo", y.shortTermAccrualsAssets, bsRef);
  add(assets, "cash", "Efectivo y otros activos líquidos", y.cash, bsRef);
  const currentNamed = y.inventories + y.tradeAndOtherReceivables + y.shortTermInvestments + y.shortTermAccrualsAssets + y.cash;
  add(assets, "otherReceivables", "Otros activos corrientes (resto del activo corriente)", y.currentAssets - currentNamed, bsRef);

  // --- Patrimonio neto y pasivo. Deudas a largo/corto plazo (bank, leases, other) are financial debt, as the PGC
  // mapping treats groups 17 and 52; group-company debt is financial long term and related-party short term.
  add(liabs, "equity", "Patrimonio neto", y.equity, bsRef);
  add(liabs, "provisions", "Provisiones a largo plazo", y.longTermProvisions, bsRef);
  add(liabs, "longTermFinancialDebt", "Deudas con entidades de crédito (l/p)", y.longTermBankDebt, bsRef);
  add(liabs, "longTermFinancialDebt", "Arrendamiento financiero (l/p)", y.longTermFinanceLeases, bsRef);
  add(liabs, "longTermFinancialDebt", "Otras deudas a largo plazo", y.longTermOtherDebts, bsRef);
  add(liabs, "longTermFinancialDebt", "Deudas con empresas del grupo (l/p)", y.longTermGroupDebts, bsRef);
  const ltNamed = y.longTermProvisions + y.longTermBankDebt + y.longTermFinanceLeases + y.longTermOtherDebts + y.longTermGroupDebts;
  add(liabs, "longTermOtherLiabilities", "Otros pasivos no corrientes (impuesto diferido, periodificaciones…)", y.nonCurrentLiabilities - ltNamed, bsRef);

  // Short-term provisions join the single provisions line, as 499/529 do in the mapping (outside current liabilities).
  add(liabs, "provisions", "Provisiones a corto plazo", y.shortTermProvisions, bsRef);
  add(liabs, "shortTermFinancialDebt", "Deudas con entidades de crédito (c/p)", y.shortTermBankDebt, bsRef);
  add(liabs, "shortTermFinancialDebt", "Arrendamiento financiero (c/p)", y.shortTermFinanceLeases, bsRef);
  add(liabs, "shortTermFinancialDebt", "Otras deudas a corto plazo", y.shortTermOtherDebts, bsRef);
  add(liabs, "relatedPartyShortTerm", "Deudas con empresas del grupo (c/p)", y.shortTermGroupDebts, bsRef);
  const suppliers = y.suppliers > 0 ? y.suppliers : y.tradeAndOtherPayables;
  add(liabs, "tradePayables", "Proveedores", suppliers, bsRef);
  add(liabs, "otherCurrentLiabilities", "Otros acreedores", y.tradeAndOtherPayables - suppliers, bsRef);
  const stNamed = y.shortTermProvisions + y.shortTermBankDebt + y.shortTermFinanceLeases + y.shortTermOtherDebts + y.shortTermGroupDebts + y.tradeAndOtherPayables;
  add(liabs, "otherCurrentLiabilities", "Otros pasivos corrientes (resto del pasivo corriente)", y.currentLiabilities - stNamed, bsRef);

  // --- Pérdidas y ganancias (expenses printed negative → positive canonical expenses)
  add(pnl, "revenue", "Importe neto de la cifra de negocios", y.revenue, plRef);
  add(pnl, "otherOperatingIncome", "Otros ingresos de explotación", y.otherOperatingIncome, plRef);
  add(pnl, "otherOperatingIncome", "Variación de existencias de productos", y.inventoryChange, plRef);
  add(pnl, "otherOperatingIncome", "Trabajos realizados para el activo", y.ownWorkCapitalised, plRef);
  add(pnl, "cogs", "Aprovisionamientos", -y.supplies, plRef);
  add(pnl, "personnel", "Gastos de personal", -y.personnel, plRef);
  add(pnl, "otherOperatingExpenses", "Otros gastos de explotación", -y.otherOperatingExpenses, plRef);
  add(pnl, "depreciation", "Amortización del inmovilizado", -y.depreciation, plRef);
  add(pnl, "grantsTransferred", "Imputación de subvenciones", y.grantsTransferred, plRef);
  // Provision surpluses and fixed-asset impairment/disposals are outside EBITDA, as 79x/69x/67x-77x are in the mapping.
  add(pnl, "operatingImpairments", "Excesos de provisiones", -y.provisionSurpluses, plRef);
  add(pnl, "operatingImpairments", "Deterioro y resultado por enajenaciones del inmovilizado", -y.fixedAssetImpairmentAndDisposals, plRef);
  add(pnl, "nonRecurringResult", "Otros resultados", y.otherResults, plRef);
  const opNamed =
    y.revenue + y.otherOperatingIncome + y.inventoryChange + y.ownWorkCapitalised + y.supplies + y.personnel + y.otherOperatingExpenses +
    y.depreciation + y.grantsTransferred + y.provisionSurpluses + y.fixedAssetImpairmentAndDisposals + y.otherResults;
  const opResidual = y.operatingResult - opNamed;
  // Lines not named (e.g. negative goodwill) are kept out of EBITDA.
  add(pnl, "nonRecurringResult", "Otras partidas del resultado de explotación", opResidual, plRef);

  add(pnl, "financialIncome", "Ingresos financieros", y.financialIncome, plRef);
  add(pnl, "financialExpense", "Gastos financieros", -y.financialExpenses, plRef);
  const finResidual = y.financialResult - (y.financialIncome + y.financialExpenses);
  add(pnl, "financialImpairments", "Otros resultados financieros (valor razonable, diferencias de cambio, deterioro)", -finResidual, plRef);
  add(pnl, "incomeTax", "Impuesto sobre beneficios", -y.incomeTax, plRef);
  // Discontinued operations, if any, sit between the pre-tax result and the year's result.
  const taxResidual = y.netIncome - (y.preTaxResult + y.incomeTax);
  add(pnl, "incomeTax", "Operaciones interrumpidas", -taxResidual, plRef);

  // The model's financial expenses are mostly interest; the lender sees that assumption in the lineage.
  const interestExpense = pnl.financialExpense;
  if (interestExpense) lineage.interestExpense = [{ account: "Gastos financieros (se toman como intereses)", amount: r2(interestExpense), sourceRef: plRef }];

  const data = assembleStatement({ period, assets, liabs, pnl, interestExpense, lineage, pnlAvailable: true, currentYearResultIncluded: 0 });

  // --- Reconciliation with the printed totals
  const mismatch = (code: string, message: string, printed: number, computed: number, ref: string) => {
    if (Math.abs(printed - computed) > TOLERANCE) {
      warnings.push({ code, message: `${message}: el modelo muestra ${eurText(printed)} y las partidas suman ${eurText(computed)}.`, detail: { printed: r2(printed), computed: r2(computed), source_ref: ref } });
    }
  };
  mismatch("ca_total_assets_mismatch", "Total activo", y.totalAssets, y.nonCurrentAssets + y.currentAssets, bsRef);
  mismatch("ca_total_liabilities_mismatch", "Total patrimonio neto y pasivo", y.totalEquityAndLiabilities, y.equity + y.nonCurrentLiabilities + y.currentLiabilities, bsRef);
  mismatch("ca_pre_tax_mismatch", "Resultado antes de impuestos", y.preTaxResult, y.operatingResult + y.financialResult, plRef);
  if (Math.abs(y.totalAssets - y.totalEquityAndLiabilities) > TOLERANCE) {
    warnings.push({ code: "balance_sheet_imbalance", message: `El activo y el patrimonio neto más pasivo de las cuentas anuales difieren en ${eurText(y.totalAssets - y.totalEquityAndLiabilities)}.`, detail: { source_ref: bsRef } });
  }
  const material = (n: number, base: number) => Math.abs(n) > Math.max(TOLERANCE, 0.02 * Math.abs(base));
  if (y.currentAssets - currentNamed < -TOLERANCE || y.currentLiabilities - stNamed < -TOLERANCE || y.nonCurrentLiabilities - ltNamed < -TOLERANCE) {
    warnings.push({ code: "ca_lines_exceed_total", message: "Algunas partidas leídas de las cuentas anuales suman más que el total de su bloque; revisa el balance en el PDF.", detail: { source_ref: bsRef } });
  }
  if (material(opResidual, y.revenue)) {
    warnings.push({
      code: "ca_operating_lines_unreconciled",
      message: `El resultado de explotación incluye ${eurText(opResidual)} en partidas no identificadas; se dejan fuera del EBITDA.`,
      detail: { amount: r2(opResidual), source_ref: plRef },
    });
  }
  if (Math.abs(taxResidual) > TOLERANCE) {
    warnings.push({ code: "ca_discontinued_operations", message: `El resultado del ejercicio incluye ${eurText(taxResidual)} de operaciones interrumpidas u otras partidas tras impuestos.`, detail: { amount: r2(taxResidual), source_ref: plRef } });
  }
  return { data, warnings };
}

/** Period of the closed year the accounts cover: printed closing date (or the case's), and its length. */
export function annualAccountsPeriod(a: AnnualAccountsExtraction, caseFiscalYearEnd: string | null): Period | null {
  const end = a.periodEnd ?? caseFiscalYearEnd ?? (a.fiscalYear > 0 ? `${a.fiscalYear}-12-31` : null);
  if (!end) return null;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCMonth(d.getUTCMonth() - a.months);
  return { kind: "closed_fy", start: d.toISOString().slice(0, 10), end };
}
