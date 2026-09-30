/**
 * What Claude returns for a commercial credit report on the sample company (fictitious, Experian-like layout):
 * provider rating, probability of default and credit limit; two RAI/ASNEF incidents (one paid); one AEAT claim;
 * two years of deposited-accounts figures. Revenue 2025 matches tb-small-sl (1.000.000 €).
 */
import type { SolvencyWire } from "../extract/schemas.ts";

export const solvencyWireSample: SolvencyWire = {
  document_type: "solvency_report",
  company_nif: "B12345674",
  company_name: "DISTRIBUCIONES EJEMPLO SL",
  legible: true,
  provider: "experian",
  provider_name: "Experian · Informe de empresa",
  report_date: "2026-09-15",
  rating: { value: "7", scale: "1-10", description: "Riesgo medio-bajo", page: 1 },
  default_probability: { percent: 1.85, horizon_months: 12, page: 1 },
  credit_limit: { amount: 60_000, page: 1 },
  payment_incidents: [
    { registry: "rai", registry_name: "RAI", creditor: "Banco Ejemplo SA", amount: 4_200.5, date: "2026-06-10", status: "active", page: 4 },
    { registry: "asnef_empresas", registry_name: "ASNEF-Empresas", creditor: "Telecom Ejemplo SA", amount: 310, date: "2025-11-02", status: "resolved", page: 4 },
  ],
  payment_incidents_total: { count: 1, amount: 4_200.5, page: 4 },
  judicial_incidents: [
    { type: "public_claim", description: "Reclamación AEAT por IVA 3T 2025", amount: 12_000, date: "2026-02-20", status: "active", page: 5 },
  ],
  financials: [
    { fiscal_year: 2025, revenue: 1_000_000, net_income: 71_000, equity: 221_000, total_assets: 519_000, page: 6 },
    { fiscal_year: 2024, revenue: 870_000, net_income: 52_000, equity: 150_000, total_assets: 440_000, page: 6 },
  ],
};
