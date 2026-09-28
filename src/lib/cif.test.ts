import { describe, expect, it } from "vitest";
import { isValidCif, normalizeCif } from "./cif.ts";

describe("isValidCif", () => {
  it("accepts valid CIFs with digit and letter controls", () => {
    expect(isValidCif("B00000000")).toBe(true);
    expect(isValidCif("A58818501")).toBe(true);
    expect(isValidCif("Q2826000H")).toBe(true);
  });
  it("normalises spaces, dots, dashes and case", () => {
    expect(normalizeCif(" b-5881.8501 ")).toBe("B58818501");
    expect(isValidCif("a-58818501")).toBe(true);
  });
  it("rejects a wrong control character", () => {
    expect(isValidCif("A58818502")).toBe(false);
    expect(isValidCif("B00000001")).toBe(false);
  });
  it("enforces letter vs digit control by entity type", () => {
    expect(isValidCif("Q28260008")).toBe(false); // Q requires a letter
    expect(isValidCif("A5881850A")).toBe(false); // A requires a digit
  });
  it("rejects natural-person NIF/NIE and malformed input", () => {
    expect(isValidCif("12345678Z")).toBe(false);
    expect(isValidCif("X1234567L")).toBe(false);
    expect(isValidCif("B123")).toBe(false);
  });
});
