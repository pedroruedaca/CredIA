import { describe, expect, it } from "vitest";
import { parseCaseParameterFields, parseParameterForm, resolveParameters, toParameter, type PolicyParameter } from "./parameters.ts";

const AMOUNT = "11111111-1111-4111-8111-111111111111";
const TERM = "22222222-2222-4222-8222-222222222222";
const CASE = "99999999-9999-4999-8999-999999999999";
const params: PolicyParameter[] = [
  { id: AMOUNT, name: "Importe solicitado", description: null, unit: "EUR" },
  { id: TERM, name: "Plazo", description: null, unit: "count" },
];

describe("parameter form", () => {
  it("reads name, description and unit", () => {
    expect(parseParameterForm({ name: "  Importe   solicitado ", unit: "EUR", description: " En euros " })).toEqual({
      ok: true,
      data: { name: "Importe solicitado", description: "En euros", unit: "EUR" },
    });
  });
  it("asks for a name and a known unit", () => {
    const r = parseParameterForm({ name: "x", unit: "km" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "unit"]);
  });
  it("keeps the stored unit when editing, whatever is posted", () => {
    expect(parseParameterForm({ name: "Importe", unit: "%" }, { unit: "EUR" })).toMatchObject({ ok: true, data: { unit: "EUR" } });
  });
});

describe("resolving parameters for a case", () => {
  it("each carries the case's value and its source_ref, or none", () => {
    expect(resolveParameters(params, CASE, [{ parameterId: AMOUNT, value: 250000 }])).toEqual([
      { id: AMOUNT, name: "Importe solicitado", unit: "EUR", value: 250000, sourceRef: `case_param:${CASE}:${AMOUNT}` },
      { id: TERM, name: "Plazo", unit: "count", value: null, sourceRef: null },
    ]);
  });
  it("ignores stored rows it does not understand", () => {
    expect(toParameter({ id: AMOUNT, name: "x", unit: "km" })).toBeNull();
    expect(toParameter({ id: TERM, name: "y", unit: "days" })).toMatchObject({ unit: "days" });
  });
});

describe("case values on a form", () => {
  it("an empty optional field means «no value»; fields not posted are left alone", () => {
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "" }, params)).toEqual({ ok: true, values: [{ parameterId: AMOUNT, value: null }] });
  });
  it("a required one must be there, and every value must be a number", () => {
    expect(parseCaseParameterFields({}, params, new Set([AMOUNT]))).toMatchObject({ ok: false, errors: { [`param_${AMOUNT}`]: expect.stringMatching(/Importe solicitado/) } });
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "doscientos" }, params)).toMatchObject({ ok: false });
  });
  it("reads Spanish thousands", () => {
    expect(parseCaseParameterFields({ [`param_${AMOUNT}`]: "1.250.000,50" }, params)).toEqual({ ok: true, values: [{ parameterId: AMOUNT, value: 1250000.5 }] });
  });
});
