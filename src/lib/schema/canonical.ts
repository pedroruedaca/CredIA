/**
 * Zod schemas for the canonical package. Used to validate:
 *  - statements before they are written to `financial_statements.statement`
 *  - LLM extractor output (Modelo 200, CIRBE, certificates) before it touches the engine
 */
import { z } from "zod";

const money = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PeriodSchema = z.object({
  kind: z.enum(["closed_fy", "ytd"]),
  start: date,
  end: date,
});

const contribution = z.object({ account: z.string(), amount: money, sourceRef: z.string().min(1) });

export const CanonicalStatementSchema = z.object({
  period: PeriodSchema,
  months: z.number().positive(),
  currency: z.literal("EUR"),
  pnlAvailable: z.boolean(),
  balanceSheet: z.object({
    assets: z.object({
      nonCurrentAssets: money, inventories: money, tradeReceivables: money, otherReceivables: money,
      shortTermInvestments: money, cash: money, prepayments: money, total: money,
    }),
    equityAndLiabilities: z.object({
      equity: money, provisions: money, longTermFinancialDebt: money, longTermOtherLiabilities: money,
      shortTermFinancialDebt: money, relatedPartyShortTerm: money, tradePayables: money,
      otherCurrentLiabilities: money, currentYearResultIncluded: money, total: money,
    }),
    imbalance: money,
  }),
  incomeStatement: z.object({
    revenue: money, otherOperatingIncome: money, grantsTransferred: money, nonRecurringResult: money,
    financialIncome: money, cogs: money, externalServices: money, otherTaxes: money, personnel: money,
    otherOperatingExpenses: money, depreciation: money, operatingImpairments: money,
    financialExpense: money, financialImpairments: money, incomeTax: money, interestExpense: money,
    operatingResult: money, ebitda: money, financialResult: money, preTaxResult: money, netIncome: money,
  }),
  derived: z.object({
    financialDebt: money, netDebt: money, workingCapital: money, currentAssets: money, currentLiabilities: money,
  }),
  lineage: z.record(z.array(contribution)),
});

/** LLM extraction target for Modelo 200 (closed-year verification anchor). Page refs are mandatory. */
export const Modelo200ExtractionSchema = z.object({
  nif: z.string(),
  fiscalYear: z.number().int(),
  fields: z.object({
    revenue: money.nullable(),          // Importe neto de la cifra de negocios
    operatingResult: money.nullable(),  // Resultado de explotación
    preTaxResult: money.nullable(),
    netIncome: money.nullable(),        // Resultado del ejercicio
    equity: money.nullable(),           // Patrimonio neto
    totalAssets: money.nullable(),
  }),
  sourcePages: z.record(z.number().int().positive()),
});

const accountsYear = z.object({
  nonCurrentAssets: money, currentAssets: money, inventories: money, tradeAndOtherReceivables: money, customers: money,
  shortTermInvestments: money, shortTermAccrualsAssets: money, cash: money, totalAssets: money,
  equity: money, nonCurrentLiabilities: money, longTermProvisions: money, longTermBankDebt: money, longTermFinanceLeases: money,
  longTermOtherDebts: money, longTermGroupDebts: money, currentLiabilities: money, shortTermProvisions: money,
  shortTermBankDebt: money, shortTermFinanceLeases: money, shortTermOtherDebts: money, shortTermGroupDebts: money,
  tradeAndOtherPayables: money, suppliers: money, totalEquityAndLiabilities: money,
  revenue: money, inventoryChange: money, ownWorkCapitalised: money, supplies: money, otherOperatingIncome: money,
  personnel: money, otherOperatingExpenses: money, depreciation: money, grantsTransferred: money, provisionSurpluses: money,
  fixedAssetImpairmentAndDisposals: money, otherResults: money, operatingResult: money, financialIncome: money,
  financialExpenses: money, otherFinancialResults: money, financialResult: money, preTaxResult: money, incomeTax: money,
  netIncome: money,
});

/**
 * Cuentas anuales on the official model: every line in euros (already scaled from the printed units), signs as
 * printed (expenses negative). Enough to rebuild a full statement when there is no trial balance.
 */
export const AnnualAccountsExtractionSchema = z.object({
  nif: z.string(),
  fiscalYear: z.number().int(),
  periodEnd: date.nullable(),
  months: z.number().int().positive(),
  model: z.enum(["normal", "abreviado", "pymes", "other"]),
  pages: z.object({ balanceSheet: z.number().int().positive().nullable(), incomeStatement: z.number().int().positive().nullable() }),
  current: accountsYear,
  prior: accountsYear.nullable(),
});
export type AccountsYear = z.infer<typeof accountsYear>;
export type AnnualAccountsExtraction = z.infer<typeof AnnualAccountsExtractionSchema>;

/** LLM extraction target for a CIRBE report. */
export const CirbeExtractionSchema = z.object({
  nif: z.string(),
  asOf: date,
  positions: z.array(z.object({
    entity: z.string().nullable(),
    product: z.string(),                // préstamo, crédito, leasing, aval, descuento...
    drawn: money,
    limit: money.nullable(),
    overdue: money.default(0),
    maturity: z.string().nullable(),
    page: z.number().int().positive(),
  })),
});

export type CanonicalStatementParsed = z.infer<typeof CanonicalStatementSchema>;

/** AEAT / TGSS "estar al corriente" certificate. */
export const CertificateExtractionSchema = z.object({
  nif: z.string(),
  issuer: z.enum(["aeat", "tgss"]),
  issuedOn: date.nullable(),
  validUntil: date.nullable(),
  result: z.enum(["al_corriente", "no_al_corriente", "unknown"]),
  verificationCode: z.string().nullable(),
  page: z.number().int().positive().nullable(),
});

const pageNum = z.number().int().positive();
const incidentStatus = z.enum(["active", "resolved", "unknown"]);

/** LLM extraction target for a commercial credit report. Provider figures are reported facts, never credIA's. */
export const SolvencyReportSchema = z.object({
  nif: z.string(),
  provider: z.enum(["experian", "informa", "axesor", "iberinform", "einforma", "equifax", "other"]),
  providerName: z.string().nullable(),
  reportDate: date,
  rating: z.object({ value: z.string(), scale: z.string().nullable(), description: z.string().nullable(), page: pageNum.nullable() }).nullable(),
  defaultProbability: z.object({ percent: z.number().min(0).max(100), horizonMonths: z.number().int().positive().nullable(), page: pageNum.nullable() }).nullable(),
  creditLimit: z.object({ amount: money, page: pageNum.nullable() }).nullable(),
  incidents: z.array(z.object({
    registry: z.enum(["rai", "asnef_empresas", "experian_bureau", "badexcug", "other"]),
    registryName: z.string().nullable(),
    creditor: z.string().nullable(),
    amount: money.nullable(),
    date: date.nullable(),
    status: incidentStatus,
    page: pageNum,
  })),
  incidentsTotal: z.object({ count: z.number().int().min(0).nullable(), amount: money.nullable(), page: pageNum.nullable() }).nullable(),
  judicial: z.array(z.object({
    type: z.enum(["concurso", "embargo", "lawsuit", "public_claim", "other"]),
    description: z.string(),
    amount: money.nullable(),
    date: date.nullable(),
    status: incidentStatus,
    page: pageNum,
  })),
  financials: z.array(z.object({
    fiscalYear: z.number().int(),
    revenue: money.nullable(),
    netIncome: money.nullable(),
    equity: money.nullable(),
    totalAssets: money.nullable(),
    page: pageNum,
  })),
});

export type SolvencyReport = z.infer<typeof SolvencyReportSchema>;

/** LLM extraction target for one Modelo 303 (IVA) return, quarterly ("1T".."4T") or monthly ("01".."12"). */
export const Modelo303ExtractionSchema = z.object({
  nif: z.string(),
  fiscalYear: z.number().int(),
  period: z.string().regex(/^([1-4]T|0[1-9]|1[0-2])$/),
  periodStart: date,
  periodEnd: date,
  accrued: z.array(z.object({ ratePercent: z.number(), base: money, quota: money, page: pageNum.nullable() })),
  /** Sum of the accrued bases (régimen general). */
  accruedBase: money,
  accruedQuota: money.nullable(),
  deductibleQuota: money.nullable(),
  result: money.nullable(),
  intraEuSupplies: money.nullable(),
  exports: money.nullable(),
  page: pageNum.nullable(),
});
export type Modelo303Extraction = z.infer<typeof Modelo303ExtractionSchema>;
export type Modelo200Extraction = z.infer<typeof Modelo200ExtractionSchema>;
export type CirbeExtraction = z.infer<typeof CirbeExtractionSchema>;
export type CertificateExtraction = z.infer<typeof CertificateExtractionSchema>;
