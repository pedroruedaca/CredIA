import { describe, expect, it } from "vitest";
import { parseAmountEs, parseNewCase } from "./new-case.ts";

const base = {
  cif: "b-00000000",
  name: "Distribuciones Ejemplo SL",
  amount: "250.000",
  product: "poliza_circulante",
  termMonths: "24",
  fiscalYearEnd: "2025-12-31",
  borrowerEmail: " Admin@Ejemplo.ES ",
  req_trial_balance: "required",
  req_tgss_cert: "required",
  age_tgss_cert: "90",
  req_cuentas_anuales: "optional",
  req_cirbe: "none",
};

describe("parseNewCase", () => {
  it("normalises and accepts a valid case", () => {
    const r = parseNewCase(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.cif).toBe("B00000000");
    expect(r.data.amount).toBe(250000);
    expect(r.data.termMonths).toBe(24);
    expect(r.data.borrowerEmail).toBe("admin@ejemplo.es");
    expect(r.data.requirements).toEqual([
      { kind: "trial_balance", required: true, maxAgeDays: null, source: "borrower" },
      { kind: "cuentas_anuales", required: false, maxAgeDays: null, source: "borrower" },
      { kind: "tgss_cert", required: true, maxAgeDays: 90, source: "borrower" },
    ]);
  });

  it("lets the lender obtain annual accounts and the solvency report by CIF, nothing else", () => {
    const r = parseNewCase({ ...base, req_cuentas_anuales: "cif", req_solvency_report: "cif", age_solvency_report: "60" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.requirements.filter((q) => q.source === "cif")).toEqual([
      { kind: "cuentas_anuales", required: true, maxAgeDays: null, source: "cif" },
      { kind: "solvency_report", required: true, maxAgeDays: 60, source: "cif" },
    ]);
    const bad = parseNewCase({ ...base, req_cirbe: "cif" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.requirements).toMatch(/no se puede obtener por CIF/);
  });

  it("returns Spanish field errors", () => {
    const r = parseNewCase({ ...base, cif: "B00000001", amount: "0", borrowerEmail: "x", termMonths: "2.5" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.cif).toMatch(/CIF no es válido/);
    expect(r.errors.amount).toMatch(/mayor que 0/);
    expect(r.errors.borrowerEmail).toMatch(/correo/);
    expect(r.errors.termMonths).toMatch(/entero/);
  });

  it("rejects a future fiscal year end", () => {
    const r = parseNewCase({ ...base, fiscalYearEnd: "2999-12-31" });
    expect(r.ok).toBe(false);
  });

  it("requires at least one requested document", () => {
    const r = parseNewCase({ cif: base.cif, name: base.name, amount: base.amount, product: base.product, termMonths: "12", fiscalYearEnd: base.fiscalYearEnd, borrowerEmail: "a@b.es" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.requirements).toMatch(/al menos un documento/);
  });

  it("validates max age days", () => {
    const r = parseNewCase({ ...base, age_tgss_cert: "-3" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.requirements).toMatch(/Certificado TGSS/);
  });
});

describe("parseAmountEs", () => {
  it("reads dots in groups of three as thousands separators", () => {
    expect(parseAmountEs("250.000")).toBe(250000);
    expect(parseAmountEs("1.250.000,50 €")).toBe(1250000.5);
  });
  it("falls back to toNumber for other formats", () => {
    expect(parseAmountEs("250000")).toBe(250000);
    expect(parseAmountEs("250000,75")).toBe(250000.75);
    expect(parseAmountEs("1.5")).toBe(1.5);
  });
});
