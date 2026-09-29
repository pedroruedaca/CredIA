import { describe, expect, it } from "vitest";
import { n43Sample, r11, r22, r33 } from "../__fixtures__/n43-sample.ts";
import { categorise, minRunningBalance, n43Amount, n43Date, parseNorma43 } from "./norma43.ts";

describe("field decoding", () => {
  it("dates and signed amounts", () => {
    expect(n43Date("260131")).toBe("2026-01-31");
    expect(n43Date("991231")).toBe("1999-12-31");
    expect(n43Date("261301")).toBeNull();
    expect(n43Amount("00000000123456", "1")).toBe(-1234.56);
    expect(n43Amount("00000000123456", "2")).toBe(1234.56);
    expect(n43Amount("0000000012345X", "2")).toBeNull();
  });
  it("fixture records are exactly 80 characters", () => {
    for (const l of n43Sample.split("\r\n").filter(Boolean)) expect(l).toHaveLength(80);
  });
});

describe("parseNorma43", () => {
  const { data, warnings } = parseNorma43(n43Sample, { docId: "doc1" });
  it("reads both accounts with masked numbers, period and balances", () => {
    expect(warnings).toEqual([]);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ bank: "2100", accountMasked: "2100 0418 ****1332", currency: "978", start: "2026-01-01", end: "2026-03-31", openingBalance: 12500, closingBalance: 32635.61 });
    expect(data[0].transactions).toHaveLength(6);
  });
  it("signs amounts, joins concept records and keeps provenance", () => {
    const [inflow, payroll] = data[0].transactions;
    expect(inflow).toMatchObject({ bookingDate: "2026-01-05", amount: 48400, reference1: "FRA 2026-001", description: "TRANSFERENCIA DE CLIENTE A SL FRA 2026-001", sourceRef: "doc:doc1:line:2" });
    expect(payroll.amount).toBe(-15000);
  });
  it("categorises by concept", () => {
    expect(data[0].transactions.map((t) => t.category)).toEqual(["transfer", "payroll", "social_security", "tax", "revenue", "bank_fees"]);
    expect(data[1].transactions[0].category).toBe("debt_service");
  });
  it("finds the lowest running balance (overdraft)", () => {
    expect(minRunningBalance(data[1])).toEqual({ balance: -2200, date: "2026-02-01" });
  });
  it("warns when totals or balances don't reconcile, or lines are malformed", () => {
    const broken = [
      r11("2100", "0418", "1", "260101", "260131", 100, "X"),
      r22("0418", "260110", "260110", "02", "000", 50),
      "22 not a record",
      r33("2100", "0418", "1", 0, 0, 1, 60, 170),
    ].join("\n");
    const codes = parseNorma43(broken, { docId: "d" }).warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["n43_malformed_lines", "n43_totals_mismatch", "n43_balance_mismatch"]));
  });
  it("returns no accounts, not an exception, for a file that is not Norma 43", () => {
    const r = parseNorma43("Fecha;Concepto;Importe\n01/01/2026;x;1", { docId: "d" });
    expect(r.data).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain("n43_no_accounts");
  });
});

describe("categorise", () => {
  it("covers common Spanish bank concepts", () => {
    expect(categorise("RECIBO PRESTAMO 123", -500)).toBe("debt_service");
    expect(categorise("CUOTA LEASING VEHICULO", -300)).toBe("debt_service");
    expect(categorise("IMPUESTO SOCIEDADES MOD. 200", -2000)).toBe("tax");
    expect(categorise("ABONO TARJETAS TPV", 900)).toBe("revenue");
    expect(categorise("INGRESO EFECTIVO", 100)).toBe("revenue");
    expect(categorise("RECIBO LUZ", -80)).toBe("other");
  });
});
