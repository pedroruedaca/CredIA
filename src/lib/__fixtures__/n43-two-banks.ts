/**
 * Synthetic Norma 43: one company, two banks, Q1 2026. Concept texts follow shapes Spanish banks print (abbreviated,
 * upper case, counterparty after "DE"/"A", references in records 23), but they are written by hand, not exported from
 * a bank. The cash in is mostly not sales: a loan drawdown, invoice advances, a capital increase, a VAT refund and
 * transfers between the company's own accounts, which a keyword "inflow = revenue" rule counts as receipts.
 *
 * Expected classification is in N43_TWO_BANKS_EXPECTED (one entry per movement, file order).
 */
import { r11, r22, r23, r33, r88 } from "./n43-sample.ts";

type Mv = { date: string; code: string; amount: number; text: string[]; ref1?: string };

/** One account: header, movements with their concept records (38 + 38 characters each), totals. */
function account(bank: string, branch: string, acct: string, holder: string, opening: number, mvs: Mv[]): string[] {
  const lines = [r11(bank, branch, acct, "260101", "260331", opening, holder)];
  for (const m of mvs) {
    lines.push(r22(branch, m.date, m.date, m.code, "000", m.amount, "", m.ref1 ?? ""));
    for (let i = 0; i < m.text.length; i += 2) lines.push(r23(i / 2 + 1, m.text[i], m.text[i + 1] ?? ""));
  }
  const outs = mvs.filter((m) => m.amount < 0);
  const ins = mvs.filter((m) => m.amount > 0);
  const sum = (xs: Mv[]) => Math.round(xs.reduce((s, m) => s + Math.abs(m.amount), 0) * 100) / 100;
  const closing = Math.round((opening + sum(ins) - sum(outs)) * 100) / 100;
  lines.push(r33(bank, branch, acct, outs.length, sum(outs), ins.length, sum(ins), closing));
  return lines;
}

// Record 11 holds 26 characters: the holder's name arrives cut short, as it does in real files.
export const TWO_BANKS_HOLDER = "COMERCIAL DISTRIBUCIONES LEVANTE SL";
export const TWO_BANKS_COMPANY = "Comercial Distribuciones Levante, S.L.";

const bankA: Mv[] = [
  { date: "260102", code: "04", amount: 36_300, text: ["TRANSFERENCIA DE FERRETERIAS DEL SUR SA"], ref1: "FRA 2025-118" },
  { date: "260105", code: "03", amount: -1_250.4, text: ["RECIBO ENDESA ENERGIA SAU", "REF 0034561"] },
  { date: "260110", code: "12", amount: 4_812.35, text: ["LIQ. TPV 012345678 COMERCIO"] },
  { date: "260115", code: "04", amount: -10_000, text: ["TRASPASO A CTA 0182 ****7781"] },
  { date: "260120", code: "02", amount: 150_000, text: ["ABONO PRESTAMO ICO 2026 NUM 99001"] },
  { date: "260125", code: "03", amount: 8_470, text: ["REMESA RECIBOS SEPA B2B COBRO", "Nº REMESA 0005"] },
  { date: "260128", code: "15", amount: -21_430.22, text: ["NOMINAS ENERO 2026"] },
  { date: "260130", code: "03", amount: -6_812.1, text: ["TGSS. COTIZACION 012026"] },
  { date: "260131", code: "17", amount: -312.45, text: ["LIQUIDACION INTERESES POLIZA CREDITO", "1234"] },
  { date: "260202", code: "14", amount: -2_420, text: ["DEVOLUCION RECIBO CLIENTE MARTINEZ", "HNOS SL"] },
  { date: "260205", code: "05", amount: -3_112.8, text: ["CUOTA PRESTAMO 9900112"] },
  { date: "260210", code: "04", amount: 20_000, text: ["TRANSFERENCIA DE COMERCIAL", "DISTRIBUCIONES LEVANTE SL"] },
  { date: "260212", code: "02", amount: 25_000, text: ["ANTICIPO FACTURAS LINEA 7788"] },
  { date: "260220", code: "03", amount: -9_870.12, text: ["AEAT MODELO 303 4T 2025"] },
  { date: "260225", code: "04", amount: 12_100, text: ["TRANSF SEPA CONSTRUCCIONES ALBA SL", "FRA 2026-014 IVA INCL"] },
  { date: "260301", code: "99", amount: 1_430, text: ["ABONO VARIOS 000123"] },
  { date: "260310", code: "04", amount: 60_000, text: ["AMPLIACION DE CAPITAL SOCIOS"] },
  { date: "260315", code: "02", amount: 3_300, text: ["DEVOLUCION IVA AEAT EJERCICIO 2025"] },
  // The bank prints the holder as beneficiary of an incoming transfer: still a customer paying.
  { date: "260318", code: "04", amount: 7_865, text: ["TRANSFERENCIA A FAVOR DE COMERCIAL", "DISTRIBUCIONES LEVANTE SL ORD", "HOSTELERIA NORTE SL"] },
  { date: "260320", code: "04", amount: 5_000, text: ["TRANSFERENCIA RECIBIDA"] },
  { date: "260331", code: "17", amount: -45, text: ["COMISION MANTENIMIENTO"] },
];

const bankB: Mv[] = [
  { date: "260115", code: "04", amount: 10_000, text: ["TRANSFERENCIA RECIBIDA"] },
  { date: "260203", code: "04", amount: 18_150, text: ["TRANSFERENCIA DE DISTRIBUCIONES GOMEZ SL"] },
  { date: "260210", code: "12", amount: -230.5, text: ["COMPRA TARJ. 4567 REPSOL ESTACION"] },
  { date: "260214", code: "11", amount: -300, text: ["REINTEGRO CAJERO 0182"] },
  { date: "260226", code: "04", amount: -3_000, text: ["TRANSFERENCIA A PROVEEDORES UNIDOS SL"] },
  { date: "260319", code: "04", amount: -5_000, text: ["TRANSFERENCIA EMITIDA"] },
  { date: "260325", code: "06", amount: 9_680, text: ["REMESA EFECTOS AL DESCUENTO 445"] },
  { date: "260326", code: "99", amount: -1_000, text: ["VARIOS"] },
  { date: "260331", code: "17", amount: -18.2, text: ["COMIS. TRANSFERENCIAS"] },
];

const fileA = account("2100", "0418", "0200051332", TWO_BANKS_HOLDER, 18_000, bankA);
const fileB = account("0182", "2200", "0201117781", TWO_BANKS_HOLDER, 4_000, bankB);
const asFile = (lines: string[]) => [...lines, r88(lines.length)].join("\r\n") + "\r\n";

/** Two files, as the company would upload them (one per bank). */
export const n43BankA = asFile(fileA);
export const n43BankB = asFile(fileB);

export const N43_TWO_BANKS_EXPECTED = {
  a: [
    ["customer_receipt", "text"],
    ["operating_payment", "text"],
    ["customer_receipt", "text"],
    ["internal_transfer", "pair"],
    ["financing", "text"],
    ["customer_receipt", "text"],
    ["payroll", "text"],
    ["social_security", "text"],
    ["interest", "text"],
    ["customer_return", "text"],
    ["debt_service", "text"],
    ["internal_transfer", "holder"],
    ["trade_finance", "text"],
    ["tax", "text"],
    ["customer_receipt", "text"],
    ["other_inflow", "default"],
    ["equity", "text"],
    ["refund", "text"],
    ["customer_receipt", "text"],
    ["internal_transfer", "pair"],
    ["bank_fees", "text"],
  ],
  b: [
    ["internal_transfer", "pair"],
    ["customer_receipt", "text"],
    ["operating_payment", "text"],
    ["cash_withdrawal", "text"],
    ["operating_payment", "text"],
    ["internal_transfer", "pair"],
    ["trade_finance", "text"],
    ["other_outflow", "default"],
    ["bank_fees", "text"],
  ],
} as const;
