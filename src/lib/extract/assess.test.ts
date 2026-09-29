import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { assessExtraction, cleanNif, type AssessContext } from "./assess.ts";
import { WIRE_FOR, type AccountsWire, type CertificateWire, type CirbeWire } from "./schemas.ts";

const CTX: AssessContext = { fileName: "doc.pdf", caseCif: "B12345674", companyName: "Distribuciones Ejemplo SL", lenderName: "Fondo Ejemplo Capital", expectedFiscalYear: 2025 };
const f = (value: number | null, page: number | null = 3) => ({ value, page });
const base = { company_nif: "B12345674", company_name: "DISTRIBUCIONES EJEMPLO SL", legible: true };

const m200: AccountsWire = {
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
