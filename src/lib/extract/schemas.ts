/**
 * Wire schemas for Claude structured output (zod/v4, as the SDK helper requires). Deliberately simple: no records,
 * defaults or refinements, which JSON-schema structured output doesn't support. Every extraction first says what
 * the document actually is and whose it is, so a wrong or foreign document is caught before its numbers are used.
 * normalize.ts turns these into the canonical (Zod v3) shapes in schema/canonical.ts.
 *
 * Structured outputs allow at most 16 parameters with union types (nullable fields) per request. Where an absent value
 * cannot be mistaken for a real one, use a sentinel instead of null: "" for text, 0 for a page, -1 for an amount or
 * percentage that cannot be negative. Keep null only for figures that can legitimately be negative or zero.
 * schemas.test.ts checks every schema against the limit.
 */
import * as z from "zod/v4";
import { M303_PERIODS } from "../tax/modelo303.ts";

export const DOC_TYPES = ["modelo200", "modelo303", "cuentas_anuales", "cirbe", "aeat_cert", "tgss_cert", "solvency_report", "bank_statement", "trial_balance", "invoice", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const common = {
  document_type: z.enum(DOC_TYPES).describe("What this document actually is, regardless of what was requested."),
  company_nif: z.string().nullable().describe("NIF/CIF of the company the document is about, exactly as printed. null if not shown."),
  company_name: z.string().nullable(),
  legible: z.boolean().describe("false if the pages are too blurry, cropped or incomplete to read the requested figures."),
};

const figure = z.object({
  value: z.number().nullable().describe("Euros as a plain number (e.g. 1234567.89). Negative when the document shows a loss or negative figure. null if absent."),
  page: z.number().int().describe("1-based PDF page where the value appears; 0 if not identifiable."),
});

export const AccountsWire = z.object({
  ...common,
  fiscal_year: z.number().int().nullable().describe("Ejercicio the figures refer to (year the fiscal period starts)."),
  period_end: z.string().nullable().describe("End date of the fiscal period, YYYY-MM-DD, if printed."),
  revenue: figure.describe("Importe neto de la cifra de negocios"),
  operating_result: figure.describe("Resultado de explotación"),
  pre_tax_result: figure.describe("Resultado antes de impuestos"),
  net_income: figure.describe("Resultado del ejercicio"),
  equity: figure.describe("Total patrimonio neto"),
  total_assets: figure.describe("Total activo"),
});
export type AccountsWire = z.infer<typeof AccountsWire>;

/** Euros as printed, 0 when the line is not in the model; sign as printed (expenses and losses negative). */
const line = (label: string) => z.number().describe(`${label}. Amount as printed, in the document's units; negative when printed negative or in parentheses; 0 if the line is not in the model.`);

/**
 * One year column of the official annual-accounts model (normal, abreviado or PYMES) as deposited in the Registro
 * Mercantil: enough lines to rebuild the balance sheet and the profit and loss account. No nulls (structured-output
 * union limit): a line absent from the model is 0; totals are always printed, so the rest can be reconciled.
 */
const AccountsYear = z.object({
  // Balance: activo
  non_current_assets: line("A) ACTIVO NO CORRIENTE (total; clave 11000 in the deposit forms)"),
  current_assets: line("B) ACTIVO CORRIENTE (total; clave 12000)"),
  inventories: line("Existencias"),
  trade_and_other_receivables: line("Deudores comerciales y otras cuentas a cobrar (total of the heading)"),
  customers: line("Clientes por ventas y prestaciones de servicios (within Deudores comerciales)"),
  short_term_investments: line("Inversiones financieras a corto plazo plus Inversiones en empresas del grupo y asociadas a corto plazo"),
  short_term_accruals_assets: line("Periodificaciones a corto plazo (activo corriente)"),
  cash: line("Efectivo y otros activos líquidos equivalentes"),
  total_assets: line("TOTAL ACTIVO (clave 10000)"),
  // Balance: patrimonio neto y pasivo
  equity: line("A) PATRIMONIO NETO (total; clave 20000)"),
  non_current_liabilities: line("B) PASIVO NO CORRIENTE (total; clave 31000)"),
  long_term_provisions: line("Provisiones a largo plazo"),
  long_term_bank_debt: line("Deudas con entidades de crédito, within Deudas a largo plazo"),
  long_term_finance_leases: line("Acreedores por arrendamiento financiero, within Deudas a largo plazo"),
  long_term_other_debts: line("Otras deudas a largo plazo, within Deudas a largo plazo"),
  long_term_group_debts: line("Deudas con empresas del grupo y asociadas a largo plazo"),
  current_liabilities: line("C) PASIVO CORRIENTE (total; clave 32000)"),
  short_term_provisions: line("Provisiones a corto plazo"),
  short_term_bank_debt: line("Deudas con entidades de crédito, within Deudas a corto plazo"),
  short_term_finance_leases: line("Acreedores por arrendamiento financiero, within Deudas a corto plazo"),
  short_term_other_debts: line("Otras deudas a corto plazo, within Deudas a corto plazo"),
  short_term_group_debts: line("Deudas con empresas del grupo y asociadas a corto plazo"),
  trade_and_other_payables: line("Acreedores comerciales y otras cuentas a pagar (total of the heading)"),
  suppliers: line("Proveedores (within Acreedores comerciales; include Proveedores empresas del grupo)"),
  total_equity_and_liabilities: line("TOTAL PATRIMONIO NETO Y PASIVO (clave 30000)"),
  // Pérdidas y ganancias
  revenue: line("1. Importe neto de la cifra de negocios (clave 40100)"),
  inventory_change: line("2. Variación de existencias de productos terminados y en curso de fabricación"),
  own_work_capitalised: line("3. Trabajos realizados por la empresa para su activo"),
  supplies: line("4. Aprovisionamientos (negative)"),
  other_operating_income: line("5. Otros ingresos de explotación"),
  personnel: line("6. Gastos de personal (negative)"),
  other_operating_expenses: line("7. Otros gastos de explotación (negative)"),
  depreciation: line("8. Amortización del inmovilizado (negative)"),
  grants_transferred: line("9. Imputación de subvenciones de inmovilizado no financiero y otras"),
  provision_surpluses: line("10. Excesos de provisiones"),
  fixed_asset_impairment_and_disposals: line("11. Deterioro y resultado por enajenaciones del inmovilizado"),
  other_results: line("Otros resultados (within the operating result)"),
  operating_result: line("A.1) RESULTADO DE EXPLOTACIÓN (clave 49100)"),
  financial_income: line("Ingresos financieros"),
  financial_expenses: line("Gastos financieros (negative)"),
  other_financial_results: line("Sum of Variación de valor razonable en instrumentos financieros, Diferencias de cambio and Deterioro y resultado por enajenaciones de instrumentos financieros"),
  financial_result: line("A.2) RESULTADO FINANCIERO"),
  pre_tax_result: line("A.3) RESULTADO ANTES DE IMPUESTOS (clave 49300)"),
  income_tax: line("Impuestos sobre beneficios (negative when an expense)"),
  net_income: line("RESULTADO DEL EJERCICIO (clave 49500)"),
});
export type AccountsYearWire = z.infer<typeof AccountsYear>;

/** Cuentas anuales (deposited annual accounts): the full model, current and prior year columns. */
export const AnnualAccountsWire = z.object({
  ...common,
  model: z.enum(["normal", "abreviado", "pymes", "other"]).describe("Which official model the accounts follow: normal, abreviado, PYMES; other if none."),
  units: z.enum(["euros", "thousands", "millions"]).describe("Units the figures are printed in (euros unless the document says miles de euros or millones)."),
  fiscal_year: z.number().int().describe("Ejercicio of the current-year column (year the fiscal period starts); 0 if not found."),
  period_end: z.string().describe("Closing date of the current-year column, YYYY-MM-DD; empty string if not printed."),
  period_months: z.number().int().describe("Length of the fiscal period in months (12 unless the document says otherwise); 0 if unknown."),
  balance_sheet_page: z.number().int().describe("1-based PDF page of the current-year balance sheet (first page if it spans several); 0 if not identifiable."),
  income_statement_page: z.number().int().describe("1-based PDF page of the profit and loss account; 0 if not identifiable."),
  current_year: AccountsYear.describe("The current-year column (ejercicio N)."),
  prior_year_shown: z.boolean().describe("true if the model also prints the prior-year column (ejercicio N-1)."),
  prior_year: AccountsYear.describe("The prior-year column (ejercicio N-1); every line 0 if not shown."),
});
export type AnnualAccountsWire = z.infer<typeof AnnualAccountsWire>;

/**
 * Modelo 200: the summary figures (verification anchor against the books) plus the full balance sheet and profit and
 * loss pages of the return, which follow the official accounts model. With them the closed year can be built from the
 * return when there is no trial balance, Holded ledger or cuentas anuales.
 */
export const Modelo200Wire = AccountsWire.extend({
  model: z.enum(["normal", "abreviado", "pymes", "other"]).describe("Which balance sheet and profit and loss model the return uses: normal, abreviado or PYMES; other if none."),
  period_months: z.number().int().describe("Length of the tax period in months (12 unless the return says otherwise); 0 if unknown."),
  balance_sheet_page: z.number().int().describe("1-based PDF page where the balance sheet (activo) starts; 0 if not identifiable."),
  income_statement_page: z.number().int().describe("1-based PDF page of the cuenta de pérdidas y ganancias; 0 if not identifiable."),
  current_year: AccountsYear.describe(
    "Every line of the balance sheet and the profit and loss account of the return, by the same line names (the clave numbers in these descriptions are those of the Registro Mercantil forms; in the Modelo 200 use the line with the same name). Amounts as printed, in euros; 0 when the line is not in the return.",
  ),
});
export type Modelo200Wire = z.infer<typeof Modelo200Wire>;

export const CirbeWire = z.object({
  ...common,
  as_of: z.string().nullable().describe("Date the report refers to (fecha de los datos / mes de declaración), YYYY-MM-DD; last day of the month if only month is given."),
  positions: z.array(
    z.object({
      entity: z.string().nullable().describe("Declaring financial institution, if shown."),
      product: z.string().describe("Tipo de producto: préstamo, crédito, leasing, aval, descuento comercial, tarjeta, etc."),
      drawn: z.number().describe("Riesgo dispuesto, euros."),
      limit: z.number().nullable().describe("Riesgo disponible + dispuesto (límite), euros, if shown."),
      overdue: z.number().nullable().describe("Importe vencido / dudoso, euros."),
      maturity: z.string().nullable().describe("Plazo residual or vencimiento as printed."),
      page: z.number().int().describe("1-based PDF page."),
    }),
  ),
});
export type CirbeWire = z.infer<typeof CirbeWire>;

export const CertificateWire = z.object({
  ...common,
  issuer: z.enum(["aeat", "tgss", "other"]),
  issue_date: z.string().nullable().describe("Fecha de expedición/emisión, YYYY-MM-DD."),
  valid_until: z.string().nullable().describe("Fecha de validez if printed, YYYY-MM-DD."),
  result: z.enum(["al_corriente", "no_al_corriente", "unknown"]).describe("Whether the certificate states the company is up to date (al corriente) with its obligations."),
  verification_code: z.string().nullable().describe("Código seguro de verificación (CSV) if printed."),
  page: z.number().int().nullable(),
});
export type CertificateWire = z.infer<typeof CertificateWire>;

export const SOLVENCY_PROVIDERS = ["experian", "informa", "axesor", "iberinform", "einforma", "equifax", "other"] as const;
const incidentStatus = z.enum(["active", "resolved", "unknown"]).describe("active if still pending/unpaid; resolved if the report marks it paid, cancelled or closed.");
const text = (what: string) => z.string().describe(`${what} Empty string if not shown.`);
const page = z.number().int().describe("1-based PDF page; 0 if not identifiable.");
const amount = (what: string) => z.number().describe(`${what} Euros as a plain number; -1 if not shown.`);
const date = z.string().describe("YYYY-MM-DD; empty string if not shown.");

/**
 * Commercial credit report on a company (informe de solvencia / informe comercial). The provider's own rating,
 * probability of default and recommended credit limit are extracted as reported facts: credIA shows them attributed
 * to the provider and never computes or combines them.
 */
export const SolvencyWire = z.object({
  ...common,
  provider: z.enum(SOLVENCY_PROVIDERS).describe("Who produced the report."),
  provider_name: text("Provider and product name as printed, e.g. 'Experian · Informe de empresa'."),
  report_date: z.string().describe("Date the report was generated, YYYY-MM-DD; empty string if not found."),
  rating: z
    .object({
      value: text("The provider's score or rating exactly as printed, e.g. '7', '72', 'B+'."),
      scale: text("The scale if printed, e.g. '1-10', '0-100', 'AAA-D'."),
      description: text("Text label next to it, e.g. 'Riesgo bajo'."),
      page,
    })
    .describe("The provider's own score/rating. value is an empty string if the report has none."),
  default_probability: z
    .object({
      percent: z.number().describe("Probability of default as a percentage number: 1.25 for '1,25 %'; -1 if the report gives none."),
      horizon_months: z.number().int().describe("Horizon of the probability, in months (12 if 'a un año'); 0 if not stated."),
      page,
    })
    .describe("Probabilidad de impago / de incumplimiento, if the report gives one."),
  credit_limit: z
    .object({
      amount: amount("Recommended or maximum credit limit (límite de crédito / riesgo máximo recomendado)."),
      page,
    })
    .describe("The provider's recommended credit limit, if any."),
  payment_incidents: z
    .array(
      z.object({
        registry: z.enum(["rai", "asnef_empresas", "experian_bureau", "badexcug", "other"]).describe("File the incident comes from: RAI, ASNEF-Empresas, Experian Bureau de Crédito, BADEXCUG or other."),
        registry_name: text("Registry name as printed."),
        creditor: text("Creditor or declaring entity."),
        amount: amount("Unpaid amount."),
        date,
        status: incidentStatus,
        page,
      }),
    )
    .describe("Each unpaid debt listed in a payment-incident file (RAI, ASNEF-Empresas, bureau). Empty if none."),
  payment_incidents_total: z
    .object({
      count: z.number().int().describe("Number of payment incidents in the report's summary; 0 if it states there are none; -1 if it gives no summary."),
      amount: amount("Total unpaid amount in the summary."),
      page,
    })
    .describe("Summary totals of payment incidents, when the report gives them (also when it lists no detail)."),
  judicial_incidents: z
    .array(
      z.object({
        type: z.enum(["concurso", "embargo", "lawsuit", "public_claim", "other"]).describe("concurso = insolvency proceedings; embargo = seizure; lawsuit = court claim; public_claim = claim or seizure by AEAT, TGSS or another public body."),
        description: z.string().describe("Short description as printed."),
        amount: amount("Amount claimed or seized."),
        date,
        status: incidentStatus,
        page,
      }),
    )
    .describe("Judicial and administrative incidents (concursos, embargos, demandas, reclamaciones de organismos públicos). Empty if none."),
  financials: z
    .array(
      z.object({
        fiscal_year: z.number().int().describe("Ejercicio (year the fiscal period starts)."),
        revenue: z.number().nullable().describe("Importe neto de la cifra de negocios / ventas, euros; null if not shown."),
        net_income: z.number().nullable().describe("Resultado del ejercicio, euros (negative for a loss); null if not shown."),
        equity: z.number().nullable().describe("Patrimonio neto / fondos propios, euros; null if not shown."),
        total_assets: z.number().nullable().describe("Total activo, euros; null if not shown."),
        page,
      }),
    )
    .describe("Financial figures the report shows per year (from the deposited annual accounts). Empty if none."),
});
export type SolvencyWire = z.infer<typeof SolvencyWire>;

/**
 * One Modelo 303 return (IVA, autoliquidación trimestral o mensual). Figures as printed; the canonical schema adds
 * the period dates and the sum of the accrued bases.
 */
export const Modelo303Wire = z.object({
  ...common,
  fiscal_year: z.number().int().describe("Ejercicio of the return; 0 if not printed."),
  period: z.enum([...M303_PERIODS, ""]).describe('Periodo of the return: "1T".."4T" for a quarter, "01".."12" for a month; "" if not printed.'),
  accrued: z
    .array(
      z.object({
        rate_percent: z.number().describe("Tipo (%) of the line, e.g. 21, 10, 4, 0."),
        base: z.number().describe("Base imponible of the line, euros, sign as printed."),
        quota: z.number().describe("Cuota of the line, euros, sign as printed."),
        page: z.number().int().describe("1-based PDF page; 0 if not identifiable."),
      }),
    )
    .describe("IVA devengado, régimen general: one entry per tipo line with a base (the 0 %, 4 %, 5 %, 10 % and 21 % lines as printed). Not adquisiciones intracomunitarias, inversión del sujeto pasivo or recargo de equivalencia. Empty if none."),
  accrued_quota_total: z.number().nullable().describe("Total cuota devengada (casilla 27). null if not printed."),
  deductible_quota_total: z.number().nullable().describe("Total a deducir (casilla 45). null if not printed."),
  result: z.number().nullable().describe("Resultado de la liquidación (casilla 71): positive a ingresar, negative a compensar o devolver. null if not printed."),
  intra_eu_supplies: z.number().nullable().describe("Entregas intracomunitarias de bienes y servicios (casilla 59). null if not printed."),
  exports: z.number().nullable().describe("Exportaciones y operaciones asimiladas (casilla 60). null if not printed."),
  not_subject_location: z.number().nullable().describe("Operaciones no sujetas por reglas de localización (casilla 120). null if not printed."),
  reverse_charge_supplies: z.number().nullable().describe("Operaciones sujetas con inversión del sujeto pasivo, as supplier (casilla 122). null if not printed."),
  summary_page: z.number().int().describe("1-based PDF page with the liquidación (casillas 27 to 71); 0 if not identifiable."),
});
export type Modelo303Wire = z.infer<typeof Modelo303Wire>;

/**
 * A bank statement PDF (extracto), read a few pages at a time (see extractBankStatement): the accounts it covers and
 * every movement printed on the requested pages, with its running balance when the statement prints one. Amounts are
 * signed by the reader (abono +, cargo −); src/lib/bank/pdf-statement.ts checks that everything adds up.
 */
export const BankStatementWire = z.object({
  ...common,
  accounts: z
    .array(
      z.object({
        iban: z.string().describe("IBAN as printed (ES + 22 digits, spaces allowed). \"\" if not printed."),
        holder: z.string().describe("Account holder (titular) as printed. \"\" if not printed."),
        holder_id: z.string().describe("NIF/CIF, DNI or NIE printed as the account holder's (titular's) ID, as printed. Not the ID of an authorised user or anyone else. \"\" if not printed."),
        bank_name: z.string().describe("Bank name as printed. \"\" if not printed."),
        currency: z.string().describe("ISO currency code of the account, e.g. EUR."),
        period_start: z.string().describe("First day of the period the statement covers, YYYY-MM-DD. \"\" if not printed."),
        period_end: z.string().describe("Last day of the period, YYYY-MM-DD. \"\" if not printed."),
        opening_balance: z.number().nullable().describe("Saldo anterior / saldo inicial printed for the period, signed. null if not on the requested pages."),
        closing_balance: z.number().nullable().describe("Saldo final / saldo a fecha printed at the end of the period, signed. null if not on the requested pages."),
      }),
    )
    .describe("Every account the statement covers, as printed on the requested pages."),
  movements: z
    .array(
      z.object({
        iban: z.string().describe("IBAN of the account the movement belongs to, as in accounts. \"\" when the statement has a single account."),
        page: z.number().int().describe("1-based PDF page where the movement is printed."),
        date: z.string().describe("Fecha de operación (or the only date printed), YYYY-MM-DD."),
        value_date: z.string().describe("Fecha valor, YYYY-MM-DD. \"\" if not printed."),
        description: z.string().describe("The movement's concept: every text line of the movement joined with spaces, as printed."),
        amount: z.number().describe("Signed amount: positive for abonos/ingresos (money in), negative for cargos/adeudos (money out)."),
        balance: z.number().nullable().describe("Running balance (saldo) printed on the movement's line, signed. null if the statement prints none."),
      }),
    )
    .describe("Every movement printed on the requested pages, in the order printed. Skip headers, subtotals and carried-forward lines (suma y sigue)."),
});
export type BankStatementWire = z.infer<typeof BankStatementWire>;

export const BANK_STATEMENT_INSTRUCTIONS =
  "This should be a Spanish bank account statement (extracto de cuenta / movimientos) from a bank's online banking or branch. Copy each movement exactly as printed, with its date, concept and amount signed by direction (abono/haber/ingreso positive, cargo/debe/adeudo negative), and the running balance when the statement prints one. Do not add, merge, compute or reorder movements; do not invent balances.";

export type ExtractKind = "modelo200" | "modelo303" | "cuentas_anuales" | "cirbe" | "aeat_cert" | "tgss_cert" | "solvency_report";

export const WIRE_FOR = {
  modelo200: Modelo200Wire,
  modelo303: Modelo303Wire,
  cuentas_anuales: AnnualAccountsWire,
  cirbe: CirbeWire,
  aeat_cert: CertificateWire,
  tgss_cert: CertificateWire,
  solvency_report: SolvencyWire,
} as const;

export const EXTRACT_INSTRUCTIONS: Record<ExtractKind, string> = {
  modelo200:
    "This should be a Spanish corporate income tax return (Modelo 200, Impuesto sobre Sociedades). Extract the figures from the balance sheet and profit and loss pages of the return: the summary figures and every requested line, copied as printed with their sign; do not add, compute or reclassify lines.",
  modelo303:
    "This should be a Spanish VAT return (Modelo 303, Impuesto sobre el Valor Añadido, autoliquidación), quarterly or monthly, as filed with the Agencia Tributaria. Extract the ejercicio, the periodo and the figures of the liquidación exactly as printed; do not compute anything the return does not show.",
  cuentas_anuales:
    "These should be Spanish annual accounts (cuentas anuales: balance, cuenta de pérdidas y ganancias, memoria), often the deposit in the Registro Mercantil on the official model (normal, abreviado or PYMES). Extract every requested line of the balance sheet and the profit and loss account for the current-year column and, when printed, the prior-year column. Copy amounts as printed, with their sign, in the document's units; do not add, compute or reclassify lines: a line the model does not show is 0.",
  cirbe:
    "This should be a Banco de España CIRBE report (Central de Información de Riesgos). List every risk position declared for the company.",
  aeat_cert:
    "This should be an Agencia Tributaria certificate stating whether the company is up to date with its tax obligations (certificado de estar al corriente de obligaciones tributarias).",
  tgss_cert:
    "This should be a Tesorería General de la Seguridad Social certificate stating whether the company is up to date with its Social Security payments (certificado de estar al corriente).",
  solvency_report:
    "This should be a commercial credit report on a Spanish company (informe de solvencia / informe comercial / informe de empresa) from a credit information provider such as Experian, Informa (D&B), Axesor, Iberinform, eInforma or Equifax. Extract the provider's own rating, probability of default and recommended credit limit exactly as reported, every payment incident (RAI, ASNEF-Empresas, bureau files) and judicial or administrative incident, and the yearly financial figures. Do not compute or infer anything the report does not state.",
};
