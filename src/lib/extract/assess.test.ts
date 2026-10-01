import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { assessExtraction, cleanNif, type AssessContext } from "./assess.ts";
import { solvencyWireSample } from "../__fixtures__/solvency-report.ts";
import { modelo303Wire } from "../__fixtures__/modelo303.ts";
import { WIRE_FOR, type CertificateWire, type CirbeWire, type Modelo200Wire } from "./schemas.ts";
import { accounts2025, zeroYear } from "../__fixtures__/annual-accounts.ts";

const CTX: AssessContext = { fileName: "doc.pdf", caseCif: "B12345674", companyName: "Distribuciones Ejemplo SL", lenderName: "Fondo Ejemplo Capital", expectedFiscalYear: 2025 };
const f = (value: number | null, page = 3) => ({ value, page });
const base = { company_nif: "B12345674", company_name: "DISTRIBUCIONES EJEMPLO SL", legible: true };

const m200: Modelo200Wire = {
  model: "pymes", period_months: 12, balance_sheet_page: 0, income_statement_page: 0, current_year: zeroYear,
  ...base, document_type: "modelo200", fiscal_year: 2025, period_end: "2025-12-31",
  revenue: f(1_000_000), operating_result: f(79_000), pre_tax_result: f(71_000 + 15_000), net_income: f(71_000), equity: f(221_000, 2), total_assets: f(519_000, 2),
};
const cert: CertificateWire = { ...base, document_type: "tgss_cert", issuer: "tgss", issue_date: "2026-09-22", valid_until: null, result: "al_corriente", verification_code: "ABC123", page: 1 };
const cirbe: CirbeWire = {
  ...base, document_type: "cirbe", as_of: "2026-08-31",
  positions: [{ entity: "Banco A", product: "préstamo", drawn: 140_000, limit: 200_000, overdue: null, maturity: "3 años", page: 2 }],
};

describe("wire schemas", () => {
  it("convert to structured-output formats", () => {
    for (const s of Object.values(WIRE_FOR)) expect(() => betaZodOutputFormat(s)).not.toThrow();
  });
});

describe("cleanNif", () => {
  it("normalises prefixes and separators", () => {
    expect(cleanNif("ES-B12345674")).toBe("B12345674");
    expect(cleanNif("b 1234567-4")).toBe("B12345674");
    expect(cleanNif(null)).toBeNull();
  });
});

describe("assessExtraction", () => {
  it("accepts a matching Modelo 200 with page provenance", () => {
    const a = assessExtraction("modelo200", m200, CTX);
    expect(a.status).toBe("parsed");
    expect(a.canonical).toMatchObject({ kind: "accounts", data: { nif: "B12345674", fiscalYear: 2025, fields: { revenue: 1_000_000, equity: 221_000 }, sourcePages: { revenue: 3, equity: 2 } } });
  });
  it("fails a document of the wrong type with a borrower-facing fix", () => {
    const a = assessExtraction("tgss_cert", { ...cert, document_type: "aeat_cert", issuer: "aeat" }, CTX);
    expect(a.status).toBe("failed");
    expect(a.attentionMessage).toBe(
      "«doc.pdf» parece un certificado de Hacienda, no un certificado de la Seguridad Social. Súbelo en el paso que le corresponde y aquí sube un certificado de la Seguridad Social.",
    );
  });
  it("fails another company's document", () => {
    const a = assessExtraction("cirbe", { ...cirbe, company_nif: "A58818501" }, CTX);
    expect(a).toMatchObject({ status: "failed", attentionMessage: expect.stringContaining("es de otra empresa (NIF A58818501)") });
  });
  it("does not fail on an unreadable NIF, only warns", () => {
    const a = assessExtraction("cirbe", { ...cirbe, company_nif: "B1234" }, CTX);
    expect(a.status).toBe("parsed");
    expect(a.warnings.map((w) => w.code)).toContain("doc_nif_unreadable");
  });
  it("keeps the full balance sheet and P&L of a Modelo 200 when its pages were read", () => {
    const a = assessExtraction("modelo200", { ...m200, current_year: accounts2025, balance_sheet_page: 3, income_statement_page: 6 }, CTX);
    expect(a.canonical).toMatchObject({
      kind: "accounts",
      data: { statement: { periodEnd: "2025-12-31", months: 12, model: "pymes", pages: { balanceSheet: 3, incomeStatement: 6 }, current: { revenue: 1_500_000, totalAssets: 930_000 } } },
    });
    expect((assessExtraction("modelo200", m200, CTX).canonical as { data: { statement: unknown } }).data.statement).toBeNull();
  });
  it("fails a Modelo 200 for the wrong fiscal year", () => {
    const a = assessExtraction("modelo200", { ...m200, fiscal_year: 2023 }, CTX);
    expect(a.attentionMessage).toBe("«doc.pdf» es el Modelo 200 del ejercicio 2023. Fondo Ejemplo Capital necesita el Modelo 200 del ejercicio 2025.");
  });
  it("fails an illegible scan", () => {
    expect(assessExtraction("aeat_cert", { ...cert, document_type: "aeat_cert", issuer: "aeat", legible: false }, CTX).attentionMessage).toMatch(/No se lee bien/);
  });
  it("takes the certificate's issue date and flags a negative certificate for the lender", () => {
    const a = assessExtraction("tgss_cert", { ...cert, result: "no_al_corriente" }, CTX);
    expect(a).toMatchObject({ status: "parsed", issuedOn: "2026-09-22" });
    expect(a.warnings.map((w) => w.code)).toContain("cert_negative");
  });
  it("asks for a complete document when dates are missing", () => {
    expect(assessExtraction("tgss_cert", { ...cert, issue_date: null }, CTX)).toMatchObject({ status: "needs_review", attentionMessage: expect.stringMatching(/fecha de emisión/) });
    expect(assessExtraction("cirbe", { ...cirbe, as_of: "agosto" }, CTX)).toMatchObject({ status: "needs_review", canonical: null });
  });
  it("maps CIRBE positions with pages and the as-of date", () => {
    const a = assessExtraction("cirbe", cirbe, CTX);
    expect(a).toMatchObject({ status: "parsed", issuedOn: "2026-08-31", canonical: { kind: "cirbe", data: { asOf: "2026-08-31", positions: [{ drawn: 140_000, overdue: 0, page: 2 }] } } });
  });
  it("fails a Modelo 200 with no figures at all", () => {
    const empty = { ...m200, revenue: f(null), operating_result: f(null), pre_tax_result: f(null), net_income: f(null), equity: f(null), total_assets: f(null) };
    expect(assessExtraction("modelo200", empty, CTX).status).toBe("failed");
  });
});

describe("assessExtraction · informe de solvencia", () => {
  it("keeps the provider's figures, incidents and yearly figures with their pages; the report date is the issue date", () => {
    const a = assessExtraction("solvency_report", solvencyWireSample, CTX);
    expect(a.status).toBe("parsed");
    expect(a.issuedOn).toBe("2026-09-15");
    expect(a.canonical).toMatchObject({
      kind: "solvency",
      data: {
        nif: "B12345674",
        provider: "experian",
        rating: { value: "7", scale: "1-10", page: 1 },
        defaultProbability: { percent: 1.85, horizonMonths: 12 },
        creditLimit: { amount: 60_000 },
        incidents: [{ registry: "rai", amount: 4_200.5, status: "active", page: 4 }, { registry: "asnef_empresas", status: "resolved" }],
        judicial: [{ type: "public_claim", amount: 12_000, page: 5 }],
        financials: [{ fiscalYear: 2025, revenue: 1_000_000, page: 6 }, { fiscalYear: 2024 }],
      },
    });
  });
  it("turns the wire's sentinels (empty text, -1, page 0) into absent values, and clamps bad pages", () => {
    const a = assessExtraction("solvency_report", {
      ...solvencyWireSample,
      provider_name: "",
      rating: { value: " ", scale: "", description: "", page: 0 },
      default_probability: { percent: -1, horizon_months: 0, page: 0 },
      credit_limit: { amount: -1, page: 0 },
      payment_incidents: [{ ...solvencyWireSample.payment_incidents[0], creditor: "", amount: -1, date: "", page: 0 }],
      payment_incidents_total: { count: -1, amount: -1, page: 0 },
      judicial_incidents: [{ ...solvencyWireSample.judicial_incidents[0], amount: -1, date: "" }],
    }, CTX);
    expect(a.canonical).toMatchObject({
      kind: "solvency",
      data: {
        providerName: null,
        rating: null,
        defaultProbability: null,
        creditLimit: null,
        incidents: [{ creditor: null, amount: null, date: null, page: 1 }],
        incidentsTotal: null,
        judicial: [{ amount: null, date: null }],
      },
    });
    // A limit of 0 € and "no incidents" (count 0) are real values, not absent ones.
    const zero = assessExtraction("solvency_report", { ...solvencyWireSample, credit_limit: { amount: 0, page: 1 }, payment_incidents_total: { count: 0, amount: -1, page: 2 } }, CTX);
    expect(zero.canonical).toMatchObject({ data: { creditLimit: { amount: 0 }, incidentsTotal: { count: 0, amount: null } } });
  });
  it("needs review without a report date; fails another company's report", () => {
    expect(assessExtraction("solvency_report", { ...solvencyWireSample, report_date: "" }, CTX)).toMatchObject({ status: "needs_review", issuedOn: null });
    expect(assessExtraction("solvency_report", { ...solvencyWireSample, company_nif: "A58818501" }, CTX).status).toBe("failed");
  });
});

describe("Modelo 303", () => {
  it("reads the period and sums the accrued bases", () => {
    const a = assessExtraction("modelo303", modelo303Wire(2026, "2T"), CTX);
    expect(a.status).toBe("parsed");
    expect(a.canonical).toMatchObject({
      kind: "modelo303",
      data: { nif: "B12345674", fiscalYear: 2026, period: "2T", periodStart: "2026-04-01", periodEnd: "2026-06-30", accruedBase: 252_000, accruedQuota: 51_600, page: 2 },
    });
  });
  it("reads a monthly return", () => {
    const a = assessExtraction("modelo303", modelo303Wire(2026, "02"), CTX);
    expect(a.canonical).toMatchObject({ data: { periodStart: "2026-02-01", periodEnd: "2026-02-28" } });
  });
  it("asks for the full return when the period is not printed", () => {
    const a = assessExtraction("modelo303", { ...modelo303Wire(2026, "2T"), period: "" }, CTX);
    expect(a.status).toBe("needs_review");
    expect(a.warnings.map((w) => w.code)).toContain("m303_no_period");
  });
  it("fails a payment receipt without the liquidación", () => {
    const a = assessExtraction("modelo303", { ...modelo303Wire(2026, "2T"), accrued: [], accrued_quota_total: null, deductible_quota_total: null, result: null }, CTX);
    expect(a.status).toBe("failed");
  });
  it("names the Modelo 303 when it is uploaded as the Modelo 200", () => {
    const a = assessExtraction("modelo200", { ...m200, document_type: "modelo303" }, CTX);
    expect(a.attentionMessage).toContain("parece una declaración de IVA (Modelo 303)");
  });
});
