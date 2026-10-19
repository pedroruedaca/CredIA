import { describe, expect, it } from "vitest";
import type { PolicyParameter } from "../policies/parameters.ts";
import { parseNewCase } from "./new-case.ts";

const base = {
  cif: "b-00000000",
  name: "Distribuciones Ejemplo SL",
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
    expect(r.data.parameterValues).toEqual([]);
    expect(r.data.borrowerEmail).toBe("admin@ejemplo.es");
    expect(r.data.requirements).toEqual([
      { kind: "trial_balance", required: true, maxAgeDays: null, source: "borrower" },
      { kind: "cuentas_anuales", required: false, maxAgeDays: null, source: "borrower" },
      { kind: "tgss_cert", required: true, maxAgeDays: 90, source: "borrower" },
    ]);
  });

  it("lets the analyst provide any document («Lo subo yo»)", () => {
    const r = parseNewCase({ ...base, req_cuentas_anuales: "lender", req_solvency_report: "lender", req_cirbe: "lender", age_solvency_report: "60" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.requirements.filter((q) => q.source === "lender")).toEqual([
      { kind: "cuentas_anuales", required: true, maxAgeDays: null, source: "lender" },
      { kind: "cirbe", required: true, maxAgeDays: null, source: "lender" },
      { kind: "solvency_report", required: true, maxAgeDays: 60, source: "lender" },
    ]);
    const bad = parseNewCase({ ...base, req_cirbe: "cif" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.requirements).toMatch(/lo subes tú/);
  });

  it("returns Spanish field errors", () => {
    const r = parseNewCase({ ...base, cif: "B00000001", borrowerEmail: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.cif).toMatch(/CIF no es válido/);
    expect(r.errors.borrowerEmail).toMatch(/correo/);
  });

  it("rejects a future fiscal year end", () => {
    const r = parseNewCase({ ...base, fiscalYearEnd: "2999-12-31" });
    expect(r.ok).toBe(false);
  });

  it("requires at least one requested document", () => {
    const r = parseNewCase({ cif: base.cif, name: base.name, fiscalYearEnd: base.fiscalYearEnd, borrowerEmail: "a@b.es" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.requirements).toMatch(/al menos un documento/);
  });

  it("validates max age days", () => {
    const r = parseNewCase({ ...base, age_tgss_cert: "-3" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.requirements).toMatch(/Certificado TGSS/);
  });
});

describe("per-case parameters on the new case", () => {
  const AMOUNT = "11111111-1111-4111-8111-111111111111";
  const TERM = "22222222-2222-4222-8222-222222222222";
  const FIXED = "33333333-3333-4333-8333-333333333333";
  const params: PolicyParameter[] = [
    { id: AMOUNT, name: "Importe solicitado", description: null, unit: "EUR", scope: "case", value: null },
    { id: TERM, name: "Plazo", description: null, unit: "count", scope: "case", value: null },
    { id: FIXED, name: "DSCR mínimo", description: null, unit: "x", scope: "fixed", value: 1.25 },
  ];

  it("reads Spanish amounts and skips empty optional ones and fixed parameters", () => {
    const r = parseNewCase({ ...base, [`param_${AMOUNT}`]: "250.000", [`param_${TERM}`]: "", [`param_${FIXED}`]: "9" }, params);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.parameterValues).toEqual([{ parameterId: AMOUNT, value: 250000 }]);
  });

  it("requires the ones the template's policy uses, and numbers", () => {
    const r = parseNewCase({ ...base, [`param_${AMOUNT}`]: "", [`param_${TERM}`]: "doce" }, params, new Set([AMOUNT]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[`param_${AMOUNT}`]).toMatch(/Importe solicitado.*política/);
    expect(r.errors[`param_${TERM}`]).toMatch(/número/);
  });
});
