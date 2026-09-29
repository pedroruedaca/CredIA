/**
 * Wire schemas for Claude structured output (zod/v4, as the SDK helper requires). Deliberately simple: no records,
 * defaults or refinements, which JSON-schema structured output doesn't support. Every extraction first says what
 * the document actually is and whose it is, so a wrong or foreign document is caught before its numbers are used.
 * normalize.ts turns these into the canonical (Zod v3) shapes in schema/canonical.ts.
 */
import * as z from "zod/v4";

export const DOC_TYPES = ["modelo200", "cuentas_anuales", "cirbe", "aeat_cert", "tgss_cert", "bank_statement", "trial_balance", "invoice", "other"] as const;
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

export type ExtractKind = "modelo200" | "cuentas_anuales" | "cirbe" | "aeat_cert" | "tgss_cert";

export const WIRE_FOR = {
  modelo200: AccountsWire,
  cuentas_anuales: AccountsWire,
  cirbe: CirbeWire,
  aeat_cert: CertificateWire,
  tgss_cert: CertificateWire,
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
};
