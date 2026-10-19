import { describe, expect, it } from "vitest";
import { parseCaseParameterFields, parseParameterForm, resolveParameters, toParameter, type PolicyParameter } from "./parameters.ts";

const AMOUNT = "11111111-1111-4111-8111-111111111111";
const DSCR = "22222222-2222-4222-8222-222222222222";
const CASE = "99999999-9999-4999-8999-999999999999";
const params: PolicyParameter[] = [
  { id: AMOUNT, name: "Importe solicitado", description: null, unit: "EUR", scope: "case", value: null },
  { id: DSCR, name: "DSCR mínimo", description: null, unit: "x", scope: "fixed", value: 1.25 },
];

describe("parameter form", () => {
  it("reads a fixed parameter with its Spanish value", () => {
    expect(parseParameterForm({ name: "  DSCR   mínimo ", unit: "x", scope: "fixed", value: "1,25" })).toEqual({
      ok: true,
      data: { name: "DSCR mínimo", description: null, unit: "x", scope: "fixed", value: 1.25 },
    });
  });
  it("a per-case parameter has no value of its own", () => {
    expect(parseParameterForm({ name: "Importe solicitado", unit: "EUR", scope: "case", value: "5" })).toMatchObject({ ok: true, data: { scope: "case", value: null } });
  });
  it("asks for a name, unit, scope and a fixed value", () => {
    const r = parseParameterForm({ name: "x", unit: "km", scope: "fixed", value: "mucho" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "unit", "value"]);
  });
  it("keeps the stored unit and scope when editing, whatever is posted", () => {
    expect(parseParameterForm({ name: "Importe", unit: "%", scope: "fixed" }, { unit: "EUR", scope: "case" })).toMatchObject({ ok: true, data: { unit: "EUR", scope: "case", value: null } });
  });
});

describe("resolving parameters for a case", () => {
  it("fixed ones carry the lender's value, per-case ones the case's, each with its source_ref", () => {
    expect(resolveParameters(params, CASE, [{ parameterId: AMOUNT, value: 250000 }])).toEqual([
      { id: AMOUNT, name: "Importe solicitado", unit: "EUR", scope: "case", value: 250000, sourceRef: `case_param:${CASE}:${AMOUNT}` },
      { id: DSCR, name: "DSCR mínimo", unit: "x", scope: "fixed", value: 1.25, sourceRef: `param:${DSCR}` },
    ]);
  });
  it("a per-case parameter without a value for the case has none (and no source)", () => {
    expect(resolveParameters(params, CASE, [])[0]).toMatchObject({ value: null, sourceRef: null });
  });
  it("ignores stored rows it does not understand", () => {
    expect(toParameter({ id: AMOUNT, name: "x", unit: "km", scope: "case", value: null })).toBeNull();
    expect(toParameter({ id: DSCR, name: "y", unit: "x", scope: "fixed", value: "1.5" })).toMatchObject({ value: 1.5 });
  });
});

describe("per-case values on a form", () => {
  it("an empty optional field means «no value»; fixed parameters are never read", () => {
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "", [`param_${DSCR}`]: "3" }, params)).toEqual({ ok: true, values: [{ parameterId: AMOUNT, value: null }] });
  });
  it("a required one must be there, and every value must be a number", () => {
    expect(parseCaseParameterFields({}, params, new Set([AMOUNT]))).toMatchObject({ ok: false, errors: { [`param_${AMOUNT}`]: expect.stringMatching(/Importe solicitado/) } });
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "doscientos" }, params)).toMatchObject({ ok: false });
  });
  it("reads Spanish thousands", () => {
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "1.250.000,50" }, params)).toEqual({ ok: true, values: [{ parameterId: AMOUNT, value: 1250000.5 }] });
  });
});
