/**
 * What Claude returns for the deposited cuentas anuales (modelo abreviado) of a small SL, hand-checked: every block
 * adds up to its printed total. Current year 2025, prior year 2024. Figures in euros, signs as printed.
 *
 * 2025 by hand: operating result 1.500.000 + 10.000 − 800.000 + 5.000 − 380.000 − 170.000 − 45.000 + 3.000 + 2.000
 * = 125.000; EBITDA = 125.000 + 45.000 − 2.000 − 3.000 = 165.000; financial debt 210.000 + 20.000 + 5.000 + 60.000
 * + 8.000 + 7.000 = 310.000; net debt 310.000 − 95.000 − 15.000 = 200.000; working capital 510.000 − 290.000.
 */
import type { AccountsYearWire, AnnualAccountsWire } from "../extract/schemas.ts";

export const zeroYear: AccountsYearWire = {
  non_current_assets: 0, current_assets: 0, inventories: 0, trade_and_other_receivables: 0, customers: 0, short_term_investments: 0,
  short_term_accruals_assets: 0, cash: 0, total_assets: 0, equity: 0, non_current_liabilities: 0, long_term_provisions: 0,
  long_term_bank_debt: 0, long_term_finance_leases: 0, long_term_other_debts: 0, long_term_group_debts: 0, current_liabilities: 0,
  short_term_provisions: 0, short_term_bank_debt: 0, short_term_finance_leases: 0, short_term_other_debts: 0, short_term_group_debts: 0,
  trade_and_other_payables: 0, suppliers: 0, total_equity_and_liabilities: 0, revenue: 0, inventory_change: 0, own_work_capitalised: 0,
  supplies: 0, other_operating_income: 0, personnel: 0, other_operating_expenses: 0, depreciation: 0, grants_transferred: 0,
  provision_surpluses: 0, fixed_asset_impairment_and_disposals: 0, other_results: 0, operating_result: 0, financial_income: 0,
  financial_expenses: 0, other_financial_results: 0, financial_result: 0, pre_tax_result: 0, income_tax: 0, net_income: 0,
};

export const accounts2025: AccountsYearWire = {
  ...zeroYear,
  non_current_assets: 420_000, current_assets: 510_000, inventories: 85_000, trade_and_other_receivables: 310_000, customers: 280_000,
  short_term_investments: 15_000, short_term_accruals_assets: 5_000, cash: 95_000, total_assets: 930_000,
  equity: 380_000,
  non_current_liabilities: 260_000, long_term_bank_debt: 210_000, long_term_finance_leases: 20_000, long_term_other_debts: 5_000, // + 25.000 deferred tax
  current_liabilities: 290_000, short_term_bank_debt: 60_000, short_term_finance_leases: 8_000, short_term_other_debts: 7_000, short_term_group_debts: 15_000,
  trade_and_other_payables: 200_000, suppliers: 150_000, total_equity_and_liabilities: 930_000,
  revenue: 1_500_000, inventory_change: 10_000, supplies: -800_000, other_operating_income: 5_000, personnel: -380_000, other_operating_expenses: -170_000,
  depreciation: -45_000, grants_transferred: 3_000, fixed_asset_impairment_and_disposals: 2_000, operating_result: 125_000,
  financial_income: 1_000, financial_expenses: -14_000, financial_result: -13_000, pre_tax_result: 112_000, income_tax: -28_000, net_income: 84_000,
};

const accounts2024: AccountsYearWire = {
  ...zeroYear,
  non_current_assets: 400_000, current_assets: 430_000, inventories: 80_000, trade_and_other_receivables: 270_000, customers: 250_000,
  short_term_investments: 10_000, cash: 70_000, total_assets: 830_000,
  equity: 296_000, non_current_liabilities: 250_000, long_term_bank_debt: 230_000, long_term_finance_leases: 20_000,
  current_liabilities: 284_000, short_term_bank_debt: 64_000, trade_and_other_payables: 220_000, suppliers: 170_000, total_equity_and_liabilities: 830_000,
  revenue: 1_300_000, supplies: -700_000, personnel: -350_000, other_operating_expenses: -150_000, depreciation: -40_000, operating_result: 60_000,
  financial_expenses: -15_000, financial_result: -15_000, pre_tax_result: 45_000, income_tax: -11_000, net_income: 34_000,
};

export const annualAccountsWireSample: AnnualAccountsWire = {
  document_type: "cuentas_anuales",
  company_nif: "B12345674",
  company_name: "DISTRIBUCIONES EJEMPLO SL",
  legible: true,
  model: "abreviado",
  units: "euros",
  fiscal_year: 2025,
  period_end: "2025-12-31",
  period_months: 12,
  balance_sheet_page: 3,
  income_statement_page: 5,
  current_year: accounts2025,
  prior_year_shown: true,
  prior_year: accounts2024,
};
