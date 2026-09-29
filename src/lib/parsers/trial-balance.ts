/**
 * Sumas y saldos (trial balance) parser. Pure: takes the cells already read from the file (see spreadsheet.ts)
 * and returns `LedgerBalance[]`, the same shape the Holded connector produces.
 *
 * - Header detection is deterministic: column roles are recognised from Spanish/English header text, including
 *   two-row headers ("Sumas" over "Debe | Haber", "Saldos" over "Deudor | Acreedor"). When it fails, the caller
 *   may ask Claude for a `ColumnMapping` (Zod-validated) and call again with `opts.mapping`.
 * - Group/subtotal rows are dropped: an account whose code is a prefix of another account in the file is a total.
 * - Net per account comes from the closing balance columns when present (pre-closing TB: P&L balances are the
 *   period's flows); otherwise from debe − haber (+ opening balance when the sums exclude it).
 * - Never throws on bad data: problems become warnings.
 */
import { z } from "zod";
import type { LedgerBalance, Result, Warning } from "../types.ts";
import { toNumber } from "../types.ts";

export interface SheetData {
  name: string;
  rows: unknown[][];
}

export const ColumnMappingSchema = z.object({
  sheet: z.string(),
  headerRow: z.number().int().min(0), // 0-based index of the last header row
  account: z.number().int().min(0),
  name: z.number().int().min(0).nullable().optional(),
  opening: z.number().int().min(0).nullable().optional(),
  sumDebit: z.number().int().min(0).nullable().optional(),
  sumCredit: z.number().int().min(0).nullable().optional(),
  balDebit: z.number().int().min(0).nullable().optional(),
  balCredit: z.number().int().min(0).nullable().optional(),
  balance: z.number().int().min(0).nullable().optional(), // signed, debit-positive
});
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export type TemplateId = "a3" | "sage" | "contasol" | "holded" | "odoo" | "generic";

export interface TrialBalanceParse {
  template: TemplateId;
  mapping: ColumnMapping;
  /** Period printed in the file, if any (YYYY-MM-DD). */
  period: { start: string; end: string } | null;
  balances: LedgerBalance[];
  totals: { debit: number; credit: number };
  rowsRead: number;
  groupRowsDropped: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Header recognition

export const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Role = "account" | "name" | "opening" | "sumDebit" | "sumCredit" | "balDebit" | "balCredit" | "balance";

/** Role of a header cell (text already combined with the group header above it). */
export function roleOf(text: string): Role | null {
  const t = ` ${norm(text)} `;
  if (!t.trim()) return null;
  const has = (...words: string[]) => words.some((w) => t.includes(` ${w} `) || t.includes(` ${w}`));
  if (has("subcuenta", "cuenta", "codigo", "cod", "account", "n cuenta", "num cuenta") && !has("saldo", "debe", "haber", "nombre", "descripcion", "titulo")) {
    return "account";
  }
  if (has("descripcion", "nombre", "titulo", "denominacion", "concepto", "name", "description", "label")) return "name";
  if (has("saldo", "saldos", "balance")) {
    if (has("anterior", "inicial", "apertura", "initial", "opening")) return "opening";
    if (has("deudor", "debe", "debit", "deudores")) return "balDebit";
    if (has("acreedor", "haber", "credit", "acreedores")) return "balCredit";
    return "balance";
  }
  if (has("debe", "cargos", "cargo", "debit", "debitos")) return "sumDebit";
  if (has("haber", "abonos", "abono", "credit", "creditos")) return "sumCredit";
  return null;
}

/** Header text per column, carrying a group header ("Sumas", "Saldos") from the row above across empty cells. */
function combinedHeaders(rows: unknown[][], r: number): string[] {
  const row = rows[r] ?? [];
  const above = r > 0 ? rows[r - 1] ?? [] : [];
  const width = Math.max(row.length, above.length);
  const out: string[] = [];
  let group = "";
  for (let c = 0; c < width; c++) {
    const a = norm(above[c]);
    if (a) group = a;
    else if (!norm(row[c])) group = "";
    const g = /^(sumas?|saldos?|movimientos|totales|periodo)$/.test(group) ? group : "";
    out.push(`${g} ${norm(row[c])}`.trim());
  }
  return out;
}

function mappingFromHeaders(sheet: string, headerRow: number, headers: string[]): ColumnMapping | null {
  const m: Partial<Record<Role, number>> = {};
  headers.forEach((h, c) => {
    const role = roleOf(h);
    if (role && m[role] === undefined) m[role] = c;
  });
  if (m.account === undefined) return null;
  const hasAmounts =
    (m.balDebit !== undefined && m.balCredit !== undefined) ||
    m.balance !== undefined ||
    (m.sumDebit !== undefined && m.sumCredit !== undefined);
  if (!hasAmounts) return null;
  return { sheet, headerRow, ...m } as ColumnMapping;
}

/** Finds the header row in the first 40 rows of each sheet. */
export function detectMapping(sheets: SheetData[]): ColumnMapping | null {
  let best: { m: ColumnMapping; score: number } | null = null;
  for (const s of sheets) {
    const limit = Math.min(s.rows.length, 40);
    for (let r = 0; r < limit; r++) {
      const m = mappingFromHeaders(s.name, r, combinedHeaders(s.rows, r));
      if (!m) continue;
      const score = Object.values(m).filter((v) => typeof v === "number").length;
      if (!best || score > best.score) best = { m, score };
    }
    if (best) break; // first sheet with a table wins
  }
  return best?.m ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Template (software) detection: labels the source and documents quirks. Column roles come from the headers.

const TEMPLATE_SIGNS: [TemplateId, RegExp][] = [
  ["a3", /\ba3\s?(eco|asesor|con|erp)?\b|wolters/],
  ["sage", /\bsage\b|contaplus/],
  ["contasol", /contasol|software del sol/],
  ["holded", /\bholded\b/],
  ["odoo", /\bodoo\b/],
];

export function detectTemplate(sheets: SheetData[], fileName: string, mapping: ColumnMapping | null): TemplateId {
  const top = sheets
    .flatMap((s) => s.rows.slice(0, 12))
    .flat()
    .map((v) => norm(v))
    .join(" ");
  const hay = `${top} ${norm(fileName)}`;
  for (const [id, re] of TEMPLATE_SIGNS) if (re.test(hay)) return id;
  if (mapping) {
    const sheet = sheets.find((s) => s.name === mapping.sheet);
    const headers = sheet ? combinedHeaders(sheet.rows, mapping.headerRow).join("|") : "";
    // Odoo exports English headers and "code name" in one account column.
    if (/initial balance|end balance/.test(headers)) return "odoo";
    if (/sumas debe/.test(headers) && /saldos deudor/.test(headers)) return "contasol";
  }
  return "generic";
}

// ---------------------------------------------------------------------------------------------------------------
// Period detection from the printed header ("Del 01/01/2025 al 31/12/2025", "Ejercicio 2025").

const pad = (n: number) => String(n).padStart(2, "0");

function datesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(`${y}-${pad(mo)}-${pad(d)}`);
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  return out;
}

/**
 * Only unambiguous cases: one cell holding a range ("Del 01/01/2025 al 31/12/2025"), exactly two dates in the
 * header area, or "Ejercicio 2025". A print date alongside a range is ignored; anything else returns null.
 */
export function detectPeriod(sheets: SheetData[]): { start: string; end: string } | null {
  const cells = sheets
    .flatMap((s) => s.rows.slice(0, 15))
    .flat()
    .map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "")))
    .filter((t) => t.trim());
  for (const c of cells) {
    const d = datesIn(c);
    if (d.length >= 2 && /\b(del?|desde|al|hasta|a|to|from|-)\b|–|-/i.test(c)) {
      const [start, end] = d.slice(0, 2).sort();
      return { start, end };
    }
  }
  const all = cells.flatMap(datesIn);
  if (all.length === 2) {
    const [start, end] = all.sort();
    return { start, end };
  }
  const year = /\b(?:ejercicio|a[nñ]o|periodo|period|fiscal year)\s*:?\s*(20\d{2})\b/i.exec(cells.join(" "));
  return year ? { start: `${year[1]}-01-01`, end: `${year[1]}-12-31` } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Rows

/** "43000001", 43000001, "430.0.0001", "430000 Clientes" → { code: "43000001", rest: "Clientes" }. */
export function splitAccount(v: unknown): { code: string; rest: string } | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return { code: String(v), rest: "" };
  const s = String(v ?? "").trim();
  const m = /^(\d[\d.\s-]*\d|\d)(?:\s+(.*))?$/.exec(s);
  if (!m) return null;
  return { code: m[1].replace(/\D/g, ""), rest: (m[2] ?? "").trim() };
}

const cellNumber = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : toNumber(v));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseTrialBalance(
  sheets: SheetData[],
  opts: { docId: string; fileName: string; mapping?: ColumnMapping },
): Result<TrialBalanceParse | null> {
  const warnings: Warning[] = [];
  const mapping = opts.mapping ?? detectMapping(sheets);
  if (!mapping) {
    return {
      data: null,
      warnings: [{ code: "tb_header_not_found", message: "No se han encontrado las columnas de cuenta e importes." }],
    };
  }
  const sheet = sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) return { data: null, warnings: [{ code: "tb_sheet_missing", message: `No existe la hoja «${mapping.sheet}».` }] };

  const get = (row: unknown[], col: number | null | undefined) => (col === null || col === undefined ? undefined : row[col]);
  const parsed: { code: string; name: string; net: number; row: number }[] = [];
  let rowsRead = 0;

  for (let r = mapping.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const acc = splitAccount(get(row, mapping.account));
    if (!acc || acc.code.length < 1) continue; // blank, "Total", "Sumas y saldos"…
    rowsRead++;
    const name = String(get(row, mapping.name) ?? acc.rest ?? "").trim() || acc.rest;

    let net: number;
    if (mapping.balDebit != null && mapping.balCredit != null) {
      net = cellNumber(row[mapping.balDebit]) - cellNumber(row[mapping.balCredit]);
    } else if (mapping.balance != null) {
      net = cellNumber(row[mapping.balance]);
    } else {
      net = cellNumber(get(row, mapping.opening)) + cellNumber(get(row, mapping.sumDebit)) - cellNumber(get(row, mapping.sumCredit));
    }
    parsed.push({ code: acc.code, name, net: r2(net), row: r + 1 });
  }

  // Drop group and subtotal rows: codes shorter than 3 digits, and codes that prefix another code in the file.
  const codes = parsed.map((p) => p.code);
  const isGroup = (code: string) => code.length < 3 || codes.some((o) => o !== code && o.length > code.length && o.startsWith(code));
  const leaves = parsed.filter((p) => !isGroup(p.code));
  const groupRowsDropped = parsed.length - leaves.length;

  // Same leaf twice (e.g. split across pages): sum and warn.
  const byCode = new Map<string, { code: string; name: string; net: number; rows: number[] }>();
  for (const p of leaves) {
    const prev = byCode.get(p.code);
    if (prev) {
      prev.net = r2(prev.net + p.net);
      prev.rows.push(p.row);
    } else byCode.set(p.code, { code: p.code, name: p.name, net: p.net, rows: [p.row] });
  }
  const dupes = [...byCode.values()].filter((b) => b.rows.length > 1);
  if (dupes.length) {
    warnings.push({ code: "tb_duplicate_accounts", message: `${dupes.length} cuentas aparecen más de una vez; se han sumado.`, detail: { accounts: dupes.map((d) => d.code) } });
  }

  const sheetRef = encodeURIComponent(sheet.name);
  const balances: LedgerBalance[] = [...byCode.values()]
    .filter((b) => b.net !== 0)
    .map((b) => ({
      account: b.code,
      pgc3: b.code.slice(0, 3),
      name: b.name || undefined,
      debit: b.net > 0 ? b.net : 0,
      credit: b.net < 0 ? -b.net : 0,
      source: "upload" as const,
      sourceRef: `doc:${opts.docId}:sheet:${sheetRef}:row:${b.rows[0]}`,
    }));

  const debit = r2(balances.reduce((s, b) => s + b.debit, 0));
  const credit = r2(balances.reduce((s, b) => s + b.credit, 0));
  if (balances.length === 0) {
    warnings.push({ code: "tb_empty", message: "El fichero no contiene saldos de cuentas." });
  } else if (Math.abs(debit - credit) > 1) {
    warnings.push({
      code: "tb_unbalanced",
      message: `El sumas y saldos no cuadra: saldos deudores ${debit} vs acreedores ${credit}.`,
      detail: { debit, credit, difference: r2(debit - credit) },
    });
  }
  if (!balances.some((b) => /^[67]/.test(b.pgc3))) {
    warnings.push({ code: "tb_no_pnl_accounts", message: "No hay cuentas de gastos e ingresos (grupos 6 y 7): puede ser un balance posterior al cierre." });
  }

  return {
    data: {
      template: detectTemplate(sheets, opts.fileName, mapping),
      mapping,
      period: detectPeriod(sheets),
      balances,
      totals: { debit, credit },
      rowsRead,
      groupRowsDropped,
    },
    warnings,
  };
}
