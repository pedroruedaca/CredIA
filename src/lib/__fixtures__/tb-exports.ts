/**
 * Synthetic sumas y saldos exports in the layouts of A3, Sage, ContaSol, Holded and Odoo, all built from the
 * hand-checked `tbSmallSl` balances so every parse can be compared with known figures.
 * Layouts are plausible, not copies of real exports: replace with anonymised real files when available.
 */
import { tbSmallSl } from "./tb-small-sl.ts";

const accounts = tbSmallSl.map((b) => ({ code: b.account, name: b.name ?? "", net: b.debit - b.credit, debit: b.debit, credit: b.credit }));

/** Group rows ("430", "43") that real exports interleave, with their subtotal. */
function withGroups<T>(leafRow: (a: (typeof accounts)[number]) => T, groupRow: (code: string, net: number) => T): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    for (const len of [2, 3]) {
      const g = a.code.slice(0, len);
      if (seen.has(g)) continue;
      seen.add(g);
      const net = accounts.filter((x) => x.code.startsWith(g)).reduce((s, x) => s + x.net, 0);
      out.push(groupRow(g, net));
    }
    out.push(leafRow(a));
  }
  return out;
}

const es = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions); // es-ES skips grouping for 4-digit numbers by default

/** A3: title block with a period range, signed "Saldo", group rows, numbers as numbers (xlsx). */
export const a3Rows: unknown[][] = [
  ["A3ECO", null, null, null, null, "Fecha: 29/09/2026"],
  ["DISTRIBUCIONES EJEMPLO SL"],
  ["Sumas y Saldos · Del 01/01/2025 al 31/12/2025"],
  [],
  ["Cuenta", "Descripción", "Saldo Anterior", "Debe", "Haber", "Saldo"],
  ...withGroups<unknown[]>(
    (a) => [a.code, a.name, 0, a.debit, a.credit, a.net],
    (g, net) => [g, `GRUPO ${g}`, 0, net > 0 ? net : 0, net < 0 ? -net : 0, net],
  ),
  [],
  ["Totales", null, 0, accounts.reduce((s, a) => s + a.debit, 0), accounts.reduce((s, a) => s + a.credit, 0), 0],
];

/** Sage: two-row header ("Sumas" / "Saldos" over Debe/Haber/Deudor/Acreedor), "Ejercicio 2025", leaves only. */
export const sageRows: unknown[][] = [
  ["Sage 50 · Balance de sumas y saldos"],
  ["Ejercicio 2025"],
  [null, null, "Sumas", null, "Saldos", null],
  ["Cuenta", "Título", "Debe", "Haber", "Deudor", "Acreedor"],
  ...accounts.map((a) => [a.code, a.name, a.debit, a.credit, a.net > 0 ? a.net : 0, a.net < 0 ? -a.net : 0]),
];

/** ContaSol as CSV text: ";" separated, Spanish decimals, Windows-1252-compatible accents. */
export const contasolCsv = [
  "ContaSol;;;;;",
  "Balance de sumas y saldos;Desde 01/01/2025 hasta 31/12/2025;;;;",
  ";;;;;",
  "Código;Descripción;Sumas Debe;Sumas Haber;Saldos Deudor;Saldos Acreedor",
  ...withGroups<string>(
    (a) => [a.code, `"${a.name}"`, es(a.debit), es(a.credit), es(Math.max(a.net, 0)), es(Math.max(-a.net, 0))].join(";"),
    (g, net) => [g, `"Grupo ${g}"`, es(Math.max(net, 0)), es(Math.max(-net, 0)), es(Math.max(net, 0)), es(Math.max(-net, 0))].join(";"),
  ),
].join("\r\n");

/** Holded export: simple table, signed balance, no period in the file. */
export const holdedRows: unknown[][] = [
  ["Cuenta", "Nombre", "Debe", "Haber", "Saldo"],
  ...accounts.map((a) => [Number(a.code), a.name, a.debit, a.credit, a.net]),
];

/** Odoo: English headers, "code name" in one column, initial/end balance, 6-digit codes. */
export const odooRows: unknown[][] = [
  ["Trial Balance"],
  ["Distribuciones Ejemplo SL"],
  ["From: 01/01/2025", "To: 31/12/2025"],
  [],
  ["Account", "Initial Balance", "Debit", "Credit", "End Balance"],
  ...accounts.map((a) => [`${a.code.slice(0, 3)}${a.code.slice(-3)} ${a.name}`, 0, a.debit, a.credit, a.net]),
  ["Total", 0, accounts.reduce((s, a) => s + a.debit, 0), accounts.reduce((s, a) => s + a.credit, 0), 0],
];
