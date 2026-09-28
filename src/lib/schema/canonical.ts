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
