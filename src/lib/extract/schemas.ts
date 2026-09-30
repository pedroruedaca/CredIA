/**
 * Wire schemas for Claude structured output (zod/v4, as the SDK helper requires). Deliberately simple: no records,
 * defaults or refinements, which JSON-schema structured output doesn't support. Every extraction first says what
 * the document actually is and whose it is, so a wrong or foreign document is caught before its numbers are used.
 * normalize.ts turns these into the canonical (Zod v3) shapes in schema/canonical.ts.
 */
import * as z from "zod/v4";

export const DOC_TYPES = ["modelo200", "cuentas_anuales", "cirbe", "aeat_cert", "tgss_cert", "solvency_report", "bank_statement", "trial_balance", "invoice", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const common = {
  document_type: z.enum(DOC_TYPES).describe("What this document actually is, regardless of what was requested."),
  company_nif: z.string().nullable().describe("NIF/CIF of the company the document is about, exactly as printed. null if not shown."),
  company_name: z.string().nullable(),
  legible: z.boolean().describe("false if the pages are too blurry, cropped or incomplete to read the requested figures."),
};

const figure = z.object({
  value: z.number().nullable().describe("Euros as a plain number (e.g. 1234567.89). Negative when the document shows a loss or negative figure. null if absent."),
  page: z.number().int().nullable().describe("1-based PDF page where the value appears."),
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
const optDate = z.string().nullable().describe("YYYY-MM-DD, null if not shown.");

/**
 * Commercial credit report on a company (informe de solvencia / informe comercial). The provider's own rating,
 * probability of default and recommended credit limit are extracted as reported facts: credIA shows them attributed
 * to the provider and never computes or combines them.
 */
export const SolvencyWire = z.object({
  ...common,
  provider: z.enum(SOLVENCY_PROVIDERS).describe("Who produced the report."),
  provider_name: z.string().nullable().describe("Provider and product name as printed, e.g. 'Experian · Informe de empresa'."),
  report_date: z.string().nullable().describe("Date the report was generated, YYYY-MM-DD."),
  rating: z
    .object({
      value: z.string().nullable().describe("The provider's score or rating exactly as printed, e.g. '7', '72', 'B+'."),
      scale: z.string().nullable().describe("The scale if printed, e.g. '1-10', '0-100', 'AAA-D'."),
      description: z.string().nullable().describe("Text label next to it, e.g. 'Riesgo bajo'."),
      page: z.number().int().nullable(),
    })
    .describe("The provider's own score/rating. All fields null if the report has none."),
  default_probability: z
    .object({
      percent: z.number().nullable().describe("Probability of default as a percentage number: 1.25 for '1,25 %'."),
      horizon_months: z.number().int().nullable().describe("Horizon of the probability, in months (12 if 'a un año')."),
      page: z.number().int().nullable(),
    })
    .describe("Probabilidad de impago / de incumplimiento, if the report gives one."),
  credit_limit: z
    .object({
      amount: z.number().nullable().describe("Recommended or maximum credit limit (límite de crédito / riesgo máximo recomendado), euros."),
      page: z.number().int().nullable(),
    })
    .describe("The provider's recommended credit limit, if any."),
  payment_incidents: z
    .array(
      z.object({
        registry: z.enum(["rai", "asnef_empresas", "experian_bureau", "badexcug", "other"]).describe("File the incident comes from: RAI, ASNEF-Empresas, Experian Bureau de Crédito, BADEXCUG or other."),
        registry_name: z.string().nullable().describe("Registry name as printed."),
        creditor: z.string().nullable().describe("Creditor or declaring entity, if shown."),
        amount: z.number().nullable().describe("Unpaid amount, euros."),
        date: optDate,
        status: incidentStatus,
        page: z.number().int(),
      }),
    )
    .describe("Each unpaid debt listed in a payment-incident file (RAI, ASNEF-Empresas, bureau). Empty if none."),
  payment_incidents_total: z
    .object({
      count: z.number().int().nullable().describe("Number of payment incidents in the report's summary."),
      amount: z.number().nullable().describe("Total unpaid amount in the summary, euros."),
      page: z.number().int().nullable(),
    })
    .describe("Summary totals of payment incidents, when the report gives them (also when it lists no detail). count 0 if the report states there are none."),
  judicial_incidents: z
    .array(
      z.object({
        type: z.enum(["concurso", "embargo", "lawsuit", "public_claim", "other"]).describe("concurso = insolvency proceedings; embargo = seizure; lawsuit = court claim; public_claim = claim or seizure by AEAT, TGSS or another public body."),
        description: z.string().describe("Short description as printed."),
        amount: z.number().nullable(),
        date: optDate,
        status: incidentStatus,
        page: z.number().int(),
      }),
    )
    .describe("Judicial and administrative incidents (concursos, embargos, demandas, reclamaciones de organismos públicos). Empty if none."),
  financials: z
    .array(
      z.object({
        fiscal_year: z.number().int().describe("Ejercicio (year the fiscal period starts)."),
        revenue: z.number().nullable().describe("Importe neto de la cifra de negocios / ventas, euros."),
        net_income: z.number().nullable().describe("Resultado del ejercicio, euros."),
        equity: z.number().nullable().describe("Patrimonio neto / fondos propios, euros."),
        total_assets: z.number().nullable().describe("Total activo, euros."),
        page: z.number().int(),
      }),
    )
    .describe("Financial figures the report shows per year (from the deposited annual accounts). Empty if none."),
});
export type SolvencyWire = z.infer<typeof SolvencyWire>;

export type ExtractKind = "modelo200" | "cuentas_anuales" | "cirbe" | "aeat_cert" | "tgss_cert" | "solvency_report";

export const WIRE_FOR = {
  modelo200: AccountsWire,
  cuentas_anuales: AccountsWire,
  cirbe: CirbeWire,
  aeat_cert: CertificateWire,
  tgss_cert: CertificateWire,
  solvency_report: SolvencyWire,
} as const;

export const EXTRACT_INSTRUCTIONS: Record<ExtractKind, string> = {
  modelo200:
    "This should be a Spanish corporate income tax return (Modelo 200, Impuesto sobre Sociedades). Extract the figures from the balance sheet and profit and loss pages of the return.",
  cuentas_anuales:
    "These should be Spanish annual accounts (cuentas anuales: balance, cuenta de pérdidas y ganancias, memoria). Extract the figures for the current year column, not the prior year.",
  cirbe:
    "This should be a Banco de España CIRBE report (Central de Información de Riesgos). List every risk position declared for the company.",
  aeat_cert:
    "This should be an Agencia Tributaria certificate stating whether the company is up to date with its tax obligations (certificado de estar al corriente de obligaciones tributarias).",
  tgss_cert:
    "This should be a Tesorería General de la Seguridad Social certificate stating whether the company is up to date with its Social Security payments (certificado de estar al corriente).",
  solvency_report:
    "This should be a commercial credit report on a Spanish company (informe de solvencia / informe comercial / informe de empresa) from a credit information provider such as Experian, Informa (D&B), Axesor, Iberinform, eInforma or Equifax. Extract the provider's own rating, probability of default and recommended credit limit exactly as reported, every payment incident (RAI, ASNEF-Empresas, bureau files) and judicial or administrative incident, and the yearly financial figures. Do not compute or infer anything the report does not state.",
};
