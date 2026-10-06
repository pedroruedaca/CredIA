import { describe, expect, it } from "vitest";
import { holderVerdict, personalId } from "./holder.ts";

describe("account holder", () => {
  it("finds a valid DNI or NIE, not a CIF or a random number", () => {
    expect(personalId("Titular: JUAN GARCIA LOPEZ · NIF 12345678Z")).toBe("12345678Z");
    expect(personalId("NIE X1234567L")).toBe("X1234567L");
    expect(personalId("12.345.678-Z")).toBe("12345678Z");
    expect(personalId("12345678A")).toBeNull(); // wrong control letter
    expect(personalId("CIF B12345674")).toBeNull();
    expect(personalId("Cuenta 0049 1500 0512 3456")).toBeNull();
  });

  it("matches the company's name as banks print it", () => {
    const company = "Comercial Distribuciones Levante, S.L.";
    expect(holderVerdict("COMERCIAL DISTRIBUCIONES LEVANTE SL", company)).toBe("match");
    expect(holderVerdict("COMERCIAL DISTRIBUCIONES LEV", company)).toBe("match"); // Norma 43 cuts at 26 characters
    expect(holderVerdict("Comercial Distribuciones Levante", company)).toBe("match");
    expect(holderVerdict("JUAN GARCIA LOPEZ", company)).toBe("mismatch");
    expect(holderVerdict("DISTRIBUCIONES DEL SUR SL", company)).toBe("mismatch");
    expect(holderVerdict("", company)).toBe("unknown");
    expect(holderVerdict("JUAN GARCIA LOPEZ", null)).toBe("unknown");
  });
});
