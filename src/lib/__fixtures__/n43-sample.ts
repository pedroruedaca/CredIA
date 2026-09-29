/**
 * Synthetic Norma 43 file: two accounts at bank 2100 over Jan–Mar 2026, built record by record so the
 * fixed-width layout is exact. Account 1 is healthy; account 2 goes overdrawn after a loan instalment.
 */
const pad = (v: string | number, n: number, ch = "0") => String(v).padStart(n, ch).slice(-n);
const right = (v: string, n: number) => v.padEnd(n, " ").slice(0, n);
const amt = (euros: number) => pad(Math.round(Math.abs(euros) * 100), 14);
const key = (euros: number) => (euros < 0 ? "1" : "2");

export const r11 = (bank: string, branch: string, acct: string, start: string, end: string, opening: number, name: string) =>
  `11${bank}${branch}${pad(acct, 10)}${start}${end}${key(opening)}${amt(opening)}9783${right(name, 26)}   `;
export const r22 = (branch: string, op: string, val: string, common: string, own: string, euros: number, doc = "", ref1 = "", ref2 = "") =>
  `22    ${branch}${op}${val}${common}${own}${key(euros)}${amt(euros)}${pad(doc, 10)}${right(ref1, 12)}${right(ref2, 16)}`;
export const r23 = (n: number, c1: string, c2 = "") => `23${pad(n, 2)}${right(c1, 38)}${right(c2, 38)}`;
export const r33 = (bank: string, branch: string, acct: string, nd: number, debits: number, nc: number, credits: number, closing: number) =>
  `33${bank}${branch}${pad(acct, 10)}${pad(nd, 5)}${amt(debits)}${pad(nc, 5)}${amt(credits)}${key(closing)}${amt(closing)}978    `;
export const r88 = (records: number) => `88${"9".repeat(18)}${pad(records, 6)}${" ".repeat(54)}`;

const acct1 = [
  r11("2100", "0418", "0200051332", "260101", "260331", 12_500, "DISTRIBUCIONES EJEMPLO"),
  r22("0418", "260105", "260105", "02", "000", 48_400, "", "FRA 2026-001"),
  r23(1, "TRANSFERENCIA DE CLIENTE A SL", "FRA 2026-001"),
  r22("0418", "260131", "260131", "04", "000", -15_000),
  r23(1, "NOMINAS ENERO 2026"),
  r22("0418", "260131", "260131", "04", "000", -4_583.33),
  r23(1, "SEGURIDAD SOCIAL TGSS REC.", "ENERO 2026"),
  r22("0418", "260220", "260220", "03", "000", -9_870.12),
  r23(1, "AEAT MODELO 303 4T 2025"),
  r22("0418", "260315", "260315", "12", "000", 1_234.56),
  r23(1, "LIQUIDACION TPV COMERCIO"),
  r22("0418", "260331", "260331", "17", "000", -45.5),
  r23(1, "COMISION MANTENIMIENTO"),
  r33("2100", "0418", "0200051332", 4, 29_498.95, 2, 49_634.56, 32_635.61),
];
const acct2 = [
  r11("2100", "0418", "0200099876", "260101", "260331", 1_000, "DISTRIBUCIONES EJEMPLO"),
  r22("0418", "260201", "260201", "04", "000", -3_200),
  r23(1, "CUOTA PRESTAMO 0123456", "AMORTIZACION + INTERESES"),
  r22("0418", "260310", "260310", "02", "000", 2_500),
  r23(1, "TRANSFERENCIA DE CLIENTE B SL"),
  r33("2100", "0418", "0200099876", 1, 3_200, 1, 2_500, 300),
];

export const n43Sample = [...acct1, ...acct2, r88(acct1.length + acct2.length)].join("\r\n") + "\r\n";
