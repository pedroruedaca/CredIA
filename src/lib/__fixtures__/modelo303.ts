/**
 * Modelo 303 returns as Claude would extract them: Distribuciones Ejemplo SL, quarterly filer, 21 % and 10 % sales.
 * Hand-checked: accrued base 2T 26 = 240.000 + 12.000 = 252.000 €; cuota = 50.400 + 1.200 = 51.600 €.
 */
import type { Modelo303Wire } from "../extract/schemas.ts";

export const modelo303Wire = (fiscal_year: number, period: Modelo303Wire["period"], base21 = 240_000, base10 = 12_000): Modelo303Wire => ({
  document_type: "modelo303",
  company_nif: "B12345674",
  company_name: "DISTRIBUCIONES EJEMPLO SL",
  legible: true,
  fiscal_year,
  period,
  accrued: [
    { rate_percent: 21, base: base21, quota: base21 * 0.21, page: 1 },
    { rate_percent: 10, base: base10, quota: base10 * 0.1, page: 1 },
  ],
  accrued_quota_total: base21 * 0.21 + base10 * 0.1,
  deductible_quota_total: 38_000,
  result: base21 * 0.21 + base10 * 0.1 - 38_000,
  intra_eu_supplies: null,
  exports: 0,
  summary_page: 2,
});
