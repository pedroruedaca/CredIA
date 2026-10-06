/**
 * Bank statements exported from online banking as Excel or CSV → accounts in the Norma 43 shape. Pure, no LLM.
 *
 * Each sheet with a movements table is one account. The header row is found by its column names (fecha, concepto,
 * importe or cargo/abono, saldo…, as Spanish banks print them); the IBAN and holder are read from the lines above it.
 * Rows without a date (totals, notes) are skipped. The statement must add up (src/lib/bank/statement.ts); when it does
 * not, the parse says so and the pipeline marks the document for review instead of using it.
 */
import { personalAccountMessage, personalId } from "../bank/holder.ts";
import { addsUp, parseAmount, parseDate, parseIban, reconcileRows, reconciliationWarnings, toN43Account, type StatementRow } from "../bank/statement.ts";
import type { N43Account } from "./norma43.ts";
import type { SheetData } from "./trial-balance.ts";
import type { Result, Warning } from "../types.ts";

const HEADER_SCAN = 40;

/** Lower case, no accents, punctuation and currency marks as spaces. */
const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|€|eur\b/g, " ")
    .replace(/[.:_/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Role = "date" | "valueDate" | "concept" | "extra" | "amount" | "debit" | "credit" | "balance";

/** Which role a header cell plays; null when none. Order matters: value date before date, balance before amount. */
function roleOf(h: string): Role | null {
  if (!h) return null;
  if (/^(f|fecha|fec) ?valor$/.test(h)) return "valueDate";
  if (/^(f|fecha|fec)( (de )?(operacion|oper|op|contable|contab|movimiento|mov|apunte))?$/.test(h)) return "date";
  if (/^(saldo|disponible|saldo (disponible|contable|tras (el )?movimiento|resultante|final))$/.test(h)) return "balance";
  if (/^(cargo|cargos|debe|salida|salidas|reintegro|reintegros|importe cargo)$/.test(h)) return "debit";
  if (/^(abono|abonos|haber|entrada|entradas|ingreso|ingresos|importe abono)$/.test(h)) return "credit";
  if (/^(importe|importe movimiento|cantidad|importe operacion)$/.test(h)) return "amount";
  if (/^(concepto|descripcion|concepto comun|concepto propio|detalle|detalle movimiento|operacion)$/.test(h)) return "concept";
  if (/^(movimiento|observaciones|mas datos|informacion adicional|referencia|referencias|beneficiario|ordenante|remitente|concepto ampliado)$/.test(h)) return "extra";
  return null;
}

interface Columns {
  date: number;
  valueDate: number | null;
  concept: number[];
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

function findHeader(rows: unknown[][]): { index: number; cols: Columns } | null {
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN); i++) {
    const roles = (rows[i] ?? []).map((c) => roleOf(norm(c)));
    const first = (r: Role) => {
      const k = roles.indexOf(r);
      return k === -1 ? null : k;
    };
    const date = first("date") ?? first("valueDate");
    const amount = first("amount");
    const debit = first("debit");
    const credit = first("credit");
    if (date === null || (amount === null && (debit === null || credit === null))) continue;
    const concept = roles.flatMap((r, k) => (r === "concept" ? [k] : []));
    const extra = roles.flatMap((r, k) => (r === "extra" ? [k] : []));
    return {
      index: i,
      cols: { date, valueDate: date === first("valueDate") ? null : first("valueDate"), concept: [...concept, ...extra], amount, debit, credit, balance: first("balance") },
    };
  }
  return null;
}

/** Holder from the lines above the table ("Titular: EMPRESA SL", or a "Titular" cell followed by the name). */
function holderOf(pre: unknown[][]): string {
  for (const r of pre) {
    const cells = (r ?? []).map((c) => String(c ?? "").trim());
    for (let k = 0; k < cells.length; k++) {
      const m = /^titular(?: de la cuenta)?\s*[:;]?\s*(.*)$/i.exec(cells[k]);
      if (!m) continue;
      const name = m[1] || cells.slice(k + 1).find((c) => c) || "";
      if (name) return name;
    }
  }
  return "";
}

export interface BankSheetParse {
  accounts: (N43Account & { balancesKnown: boolean })[];
  /** Some account does not add up: the document needs a person to look at it before its figures are used. */
  needsReview: boolean;
  /** Set when the file must not be used at all (a person's account): the message for the company and the lender. */
  rejected?: string;
}

/** The holder's ID from the lines above the table: only on a line that names the holder or an ID (titular, NIF, DNI…). */
function holderIdOf(pre: unknown[][]): string | null {
  for (const r of pre) {
    const line = (r ?? []).map((c) => String(c ?? "")).join(" ");
    if (!/titular|\bnif\b|\bdni\b|\bnie\b|\bcif\b/i.test(line)) continue;
    const id = personalId(line);
    if (id) return id;
  }
  return null;
}

export function parseBankSheets(sheets: SheetData[], opts: { docId: string; fileName: string }): Result<BankSheetParse | null> {
  const warnings: Warning[] = [];
  const accounts: BankSheetParse["accounts"] = [];
  let needsReview = false;
  for (const sheet of sheets) {
    const h = findHeader(sheet.rows);
    if (!h) continue;
    const pre = sheet.rows.slice(0, h.index);
    const ibanText = pre.map((r) => (r ?? []).map((c) => String(c ?? "")).join(" ")).join(" ");
    const c = h.cols;
    const printed: StatementRow[] = [];
    let skipped = 0;
    for (let i = h.index + 1; i < sheet.rows.length; i++) {
      const r = sheet.rows[i] ?? [];
      const date = parseDate(r[c.date]);
      if (!date) {
        if (r.some((x) => x !== null && x !== undefined && String(x).trim() !== "")) skipped++;
        continue;
      }
      let amount: number | null;
      if (c.amount !== null) amount = parseAmount(r[c.amount]);
      else {
        const d = parseAmount(r[c.debit!]);
        const cr = parseAmount(r[c.credit!]);
        amount = d === null && cr === null ? null : Math.round(((cr ?? 0) - Math.abs(d ?? 0)) * 100) / 100;
      }
      if (amount === null || amount === 0) continue;
      const description = c.concept.map((k) => String(r[k] ?? "").trim()).filter(Boolean).join(" · ");
      const ref = sheets.length > 1 || sheet.name !== "csv" ? `doc:${opts.docId}:sheet:${sheet.name}:row:${i + 1}` : `doc:${opts.docId}:row:${i + 1}`;
      printed.push({ date, valueDate: c.valueDate !== null ? parseDate(r[c.valueDate]) : null, description, amount, balance: c.balance !== null ? parseAmount(r[c.balance]) : null, sourceRef: ref });
    }
    if (!printed.length) continue;
    if (holderIdOf(pre)) return { data: { accounts: [], needsReview: false, rejected: personalAccountMessage(opts.fileName) }, warnings: [{ code: "bank_personal_account", message: "Holder ID is a DNI/NIE" }] };
    const label = sheets.length > 1 ? `${opts.fileName} · ${sheet.name}` : opts.fileName;
    const rec = reconcileRows(printed);
    const iban = parseIban(ibanText)?.iban ?? null;
    if (!iban) warnings.push({ code: "statement_no_iban", message: `${label}: no aparece el IBAN de la cuenta; se identifica por el nombre del fichero.` });
    if (skipped) warnings.push({ code: "statement_rows_skipped", message: `${label}: ${skipped} filas sin fecha (totales o notas) no se han leído como movimientos.` });
    warnings.push(...reconciliationWarnings(label, rec));
    if (!addsUp(rec)) needsReview = true;
    accounts.push(toN43Account({ iban, holder: holderOf(pre), label, rec }));
  }
  return { data: accounts.length ? { accounts, needsReview } : null, warnings };
}
