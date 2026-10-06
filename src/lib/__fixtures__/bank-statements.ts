/**
 * Bank statement exports in the shapes Spanish online banking uses (CSV with «;», Spanish numbers, a few lines about
 * the account above the table; Excel with date cells). Written by hand from those shapes, not exported from a bank:
 * add real exports as tests when they arrive. Running balances are computed from the movements, so every fixture adds
 * up unless it is the broken one.
 */

export interface Mv {
  date: string; // YYYY-MM-DD
  text: string;
  amount: number;
}

/** One quarter of an account: opening 18.000,00. */
export const OPENING = 18_000;
export const MOVEMENTS: Mv[] = [
  { date: "2026-01-02", text: "TRANSFERENCIA DE FERRETERIAS DEL SUR SA", amount: 36_300 },
  { date: "2026-01-05", text: "RECIBO ENDESA ENERGIA SAU", amount: -1_250.4 },
  { date: "2026-01-28", text: "NOMINAS ENERO 2026", amount: -21_430.22 },
  { date: "2026-01-30", text: "TGSS COTIZACION 012026", amount: -6_812.1 },
  { date: "2026-02-05", text: "CUOTA PRESTAMO 9900112", amount: -3_112.8 },
  { date: "2026-02-20", text: "AEAT MODELO 303 4T 2025", amount: -9_870.12 },
  { date: "2026-02-25", text: "TRANSF SEPA CONSTRUCCIONES ALBA SL", amount: 12_100 },
  { date: "2026-02-27", text: "NOMINAS FEBRERO 2026", amount: -21_430.22 },
  { date: "2026-03-10", text: "LIQ. TPV 012345678 COMERCIO", amount: 4_812.35 },
  { date: "2026-03-27", text: "NOMINAS MARZO 2026", amount: -21_430.22 },
  { date: "2026-03-31", text: "COMISION MANTENIMIENTO", amount: -45 },
];
export const CLOSING = Math.round((OPENING + MOVEMENTS.reduce((s, m) => s + m.amount, 0)) * 100) / 100; // −14.168,73

export const IBAN = "ES12 0049 1500 0512 3456 7891";
export const HOLDER = "COMERCIAL DISTRIBUCIONES LEVANTE SL";

const es = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Movements with their running balance, oldest first. */
export function withBalances(mvs = MOVEMENTS, opening = OPENING) {
  let b = opening;
  return mvs.map((m) => {
    b = Math.round((b + m.amount) * 100) / 100;
    return { ...m, balance: b };
  });
}

/** CSV, newest first: «Fecha Operación;Fecha Valor;Concepto;Importe;Saldo», with the account details above. */
export function csvNewestFirst(opts: { breakLine?: number } = {}) {
  const rows = withBalances().reverse();
  const lines = [
    "Movimientos de cuenta",
    `Cuenta;${IBAN}`,
    `Titular;${HOLDER}`,
    "Periodo;01/01/2026 - 31/03/2026",
    "",
    "Fecha Operación;Fecha Valor;Concepto;Importe;Saldo",
    ...rows.map((r, i) => {
      // breakLine: a misprinted amount on that line (counting from the top), so the statement does not add up.
      const amount = opts.breakLine === i ? r.amount + 100 : r.amount;
      return `${dmy(r.date)};${dmy(r.date)};${r.text};${es(amount)};${es(r.balance)}`;
    }),
    "",
    `;;Saldo final;;${es(CLOSING)}`,
  ];
  return lines.join("\r\n");
}

/** Excel rows, newest first: dates as Date cells, numbers as numbers, «Movimiento» and «Disponible». */
export function xlsxRows(): unknown[][] {
  const rows = withBalances().reverse();
  return [
    ["Consulta de movimientos"],
    ["Titular", HOLDER],
    ["IBAN", IBAN],
    [],
    ["F.Valor", "Fecha", "Concepto", "Movimiento", "Importe", "Divisa", "Disponible", "Divisa", "Observaciones"],
    ...rows.map((r) => {
      const d = new Date(`${r.date}T00:00:00Z`);
      return [d, d, r.text, r.amount > 0 ? "Abono" : "Cargo", r.amount, "EUR", r.balance, "EUR", ""];
    }),
  ];
}

/** CSV with «Cargo» and «Abono» columns and no running balance, oldest first. */
export function csvDebitCredit() {
  return [
    "Fecha;Descripción;Cargo;Abono",
    ...MOVEMENTS.map((m) => `${dmy(m.date)};${m.text};${m.amount < 0 ? es(-m.amount) : ""};${m.amount > 0 ? es(m.amount) : ""}`),
  ].join("\n");
}
