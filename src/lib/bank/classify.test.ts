import { describe, expect, it } from "vitest";
import { N43_TWO_BANKS_EXPECTED, n43BankA, n43BankB, TWO_BANKS_COMPANY } from "../__fixtures__/n43-two-banks.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { classifyAccounts, classifyMovement, holderKey, inflowBreakdown, namesHolderAsCounterparty } from "./classify.ts";

const mv = (description: string, amount: number, commonConcept = "99") => classifyMovement({ description, amount, commonConcept });
const cat = (description: string, amount: number, code?: string) => mv(description, amount, code).category;

describe("classifyMovement: concept text", () => {
  it("money in that is not sales", () => {
    expect(cat("ABONO PRESTAMO ICO 2026", 150_000)).toBe("financing");
    expect(cat("DISPOSICION POLIZA CREDITO 1234", 30_000)).toBe("financing");
    expect(cat("PRESTAMO ENISA PARTICIPATIVO", 75_000)).toBe("financing");
    expect(cat("ANTICIPO FACTURAS LINEA 7788", 25_000)).toBe("trade_finance");
    expect(cat("ABONO FACTORING CESION 0012", 40_000)).toBe("trade_finance");
    expect(cat("ANTICIPO CONFIRMING BBVA", 12_000)).toBe("trade_finance");
    expect(cat("REMESA EFECTOS AL DESCUENTO 445", 9_680)).toBe("trade_finance");
    expect(cat("AMPLIACION DE CAPITAL SOCIOS", 60_000)).toBe("equity");
    expect(cat("APORTACION SOCIO J. GARCIA", 10_000)).toBe("equity");
    expect(cat("DEVOLUCION IVA AEAT EJERCICIO 2025", 3_300)).toBe("refund");
    expect(cat("DEVOLUCION RECIBO ENDESA", 120)).toBe("refund");
    expect(cat("ABONO COMISION MANTENIMIENTO", 45)).toBe("refund");
    expect(cat("REEMBOLSO FONDO DE INVERSION", 20_000)).toBe("investment_income");
    expect(cat("VENCIMIENTO IPF 12 MESES", 50_000)).toBe("investment_income");
    expect(cat("TRASPASO DESDE SANTANDER", 3_000)).toBe("internal_transfer");
    expect(cat("ANULACION APUNTE 22/01", 500)).toBe("reversal");
  });

  it("money in that is customers paying", () => {
    expect(cat("TRANSFERENCIA DE FERRETERIAS DEL SUR SA", 36_300)).toBe("customer_receipt");
    expect(cat("TRANSF SEPA CONSTRUCCIONES ALBA SL FRA 2026-014 IVA INCL", 12_100)).toBe("customer_receipt");
    expect(cat("LIQ. TPV 012345678 COMERCIO", 4_812.35)).toBe("customer_receipt");
    expect(cat("ABONO TARJETAS TPV", 900)).toBe("customer_receipt");
    expect(cat("REMESA RECIBOS SEPA B2B COBRO", 8_470)).toBe("customer_receipt");
    expect(cat("PAGO CONFIRMING GRUPO DIA", 6_050)).toBe("customer_receipt");
    expect(cat("INGRESO EFECTIVO", 100)).toBe("customer_receipt");
    expect(cat("BIZUM RECIBIDO", 60)).toBe("customer_receipt");
    // Public bodies are customers when they pay in; they are taxes only when the company pays them.
    expect(cat("TRANSFERENCIA DE AYUNTAMIENTO DE VALENCIA FRA 2026-031", 14_520)).toBe("customer_receipt");
    // A customer whose invoice mentions a commission is not a fee refund.
    expect(cat("TRANSFERENCIA DE AGENCIA COSTA COMISION VENTAS", 1_800)).toBe("customer_receipt");
  });

  it("money out", () => {
    expect(cat("NOMINAS ENERO 2026", -21_430)).toBe("payroll");
    expect(cat("TGSS. COTIZACION 012026", -6_812)).toBe("social_security");
    expect(cat("SEGUROS SOCIALES ENERO", -6_812)).toBe("social_security");
    expect(cat("AEAT MODELO 303 4T 2025", -9_870)).toBe("tax");
    expect(cat("IMPUESTO SOCIEDADES MOD. 200", -2_000)).toBe("tax");
    expect(cat("AYUNTAMIENTO VALENCIA IBI 2026", -840)).toBe("tax");
    expect(cat("CUOTA PRESTAMO 9900112", -3_112)).toBe("debt_service");
    expect(cat("RECIBO PRESTAMO 123", -500)).toBe("debt_service");
    expect(cat("CUOTA LEASING VEHICULO", -300)).toBe("debt_service");
    expect(cat("RECIBO HIPOTECA NAVE", -1_900)).toBe("debt_service");
    expect(cat("LIQUIDACION INTERESES POLIZA CREDITO 1234", -312)).toBe("interest");
    expect(cat("INTERESES DESCUBIERTO", -18)).toBe("interest");
    expect(cat("COMISION MANTENIMIENTO", -45)).toBe("bank_fees");
    expect(cat("COMIS. TRANSFERENCIAS", -18)).toBe("bank_fees");
    expect(cat("RENTING FURGONETA ALD", -420)).toBe("operating_payment");
    expect(cat("RECIBO ENDESA ENERGIA", -1_250)).toBe("operating_payment");
    expect(cat("COMPRA TARJ. 4567 REPSOL", -230)).toBe("operating_payment");
    expect(cat("TRANSFERENCIA A PROVEEDORES UNIDOS SL", -3_000)).toBe("operating_payment");
    expect(cat("REINTEGRO CAJERO 0182", -300)).toBe("cash_withdrawal");
    expect(cat("DEVOLUCION RECIBO CLIENTE MARTINEZ", -2_420)).toBe("customer_return");
    expect(cat("RECIBO IMPAGADO 0099 CLIENTE", -600)).toBe("customer_return");
    expect(cat("PAGO DIVIDENDO 2025", -15_000)).toBe("distribution");
  });

  it("falls back to the AEB common concept, then to unclassified", () => {
    expect(mv("", -3_000, "05")).toEqual({ category: "debt_service", basis: "code", rule: "aeb:05" });
    expect(mv("REF 0001", -2_000, "15").category).toBe("payroll");
    expect(mv("", 500, "14").category).toBe("refund");
    expect(mv("", -500, "14").category).toBe("customer_return");
    expect(mv("", -40, "17").category).toBe("bank_fees");
    expect(mv("", 1_000, "04").category).toBe("customer_receipt");
    expect(mv("ABONO VARIOS 000123", 1_430, "99")).toEqual({ category: "other_inflow", basis: "default", rule: "default" });
    expect(mv("VARIOS", -1_000, "99").category).toBe("other_outflow");
  });

  it("text wins over a coarse code: payroll paid as a transfer", () => {
    expect(mv("NOMINAS ENERO", -15_000, "04")).toEqual({ category: "payroll", basis: "text", rule: "payroll" });
  });
});

describe("holder names", () => {
  it("keys drop the legal form and survive the 26-character cut", () => {
    expect(holderKey("Comercial Distribuciones Levante, S.L.")).toBe("comercial distribuciones levante");
    expect(holderKey("SL")).toBeNull();
    const keys = [holderKey("COMERCIAL DISTRIBUCIONES L")!];
    expect(namesHolderAsCounterparty("transferencia de comercial distribuciones levante sl", 20_000, keys)).toBe(true);
    expect(namesHolderAsCounterparty("transferencia a comercial distribuciones levante sl", -5_000, keys)).toBe(true);
    // The bank naming the holder as beneficiary of an incoming payment says nothing about who paid.
    expect(namesHolderAsCounterparty("transferencia a favor de comercial distribuciones levante sl ord hosteleria norte sl", 7_865, keys)).toBe(false);
    expect(namesHolderAsCounterparty("transferencia de distribuciones gomez sl", 18_150, keys)).toBe(false);
  });
});

describe("two banks, one company (Q1 2026)", () => {
  const a = parseNorma43(n43BankA, { docId: "a" });
  const b = parseNorma43(n43BankB, { docId: "b" });
  const accounts = classifyAccounts([...a.data, ...b.data], { companyName: TWO_BANKS_COMPANY });
  const [acctA, acctB] = accounts;

  it("the files reconcile", () => {
    expect(a.warnings).toEqual([]);
    expect(b.warnings).toEqual([]);
  });

  it("classifies every movement as expected, with its basis", () => {
    expect(acctA.transactions.map((t) => [t.category, t.categoryBasis])).toEqual(N43_TWO_BANKS_EXPECTED.a);
    expect(acctB.transactions.map((t) => [t.category, t.categoryBasis])).toEqual(N43_TWO_BANKS_EXPECTED.b);
  });

  it("pairs transfers between the two banks and points each side at the other", () => {
    const out = acctA.transactions[3];
    const inn = acctB.transactions[0];
    expect(out.categoryRule).toBe(`pair:${inn.sourceRef}`);
    expect(inn.categoryRule).toBe(`pair:${out.sourceRef}`);
  });

  it("finds the same pairs only when both files are classified together", () => {
    const alone = parseNorma43(n43BankB, { docId: "b" }).data[0].transactions[0];
    expect(alone.category).toBe("customer_receipt"); // on its own, a bare «transferencia recibida» looks like a customer
  });

  it("separates sales receipts from the rest of the money in", () => {
    const br = inflowBreakdown(accounts.flatMap((x) => x.transactions));
    expect(br.identifiedReceipts).toBe(87_697.35);
    expect(br.unclassified).toBe(1_430);
    expect(br.returnedReceipts).toBe(2_420);
    expect(br.receipts).toBe(86_707.35);
    expect(br.excluded).toEqual({ internal_transfer: 35_000, financing: 150_000, trade_finance: 34_680, equity: 60_000, refund: 3_300 });
    expect(br.total).toBe(372_107.35);
    // Counting every inflow as revenue would have overstated receipts more than fourfold.
    expect(br.total / br.receipts).toBeGreaterThan(4);
  });
});
