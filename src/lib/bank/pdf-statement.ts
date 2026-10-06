/**
 * A bank statement PDF, as read by Claude window by window (extractBankStatement) → accounts in the Norma 43 shape.
 * Pure. The reading is only trusted if it adds up: the movements of each account, in order, must take the opening
 * balance to every printed running balance and to the closing balance (src/lib/bank/statement.ts). A misread or
 * skipped line breaks that, and the document goes to review instead of into the figures.
 */
import { isValidCif } from "../cif.ts";
import { cleanNif } from "../extract/assess.ts";
import type { BankStatementWire } from "../extract/schemas.ts";
import type { N43Account } from "../parsers/norma43.ts";
import type { Warning } from "../types.ts";
import { personalAccountMessage, personalId } from "./holder.ts";
import { addsUp, parseDate, parseIban, reconcileRows, reconciliationWarnings, toN43Account, type StatementRow } from "./statement.ts";

export interface PdfStatementResult {
  status: "parsed" | "needs_review" | "failed";
  /** For the company and the lender, when it is not parsed. */
  attention: string | null;
  accounts: (N43Account & { balancesKnown: boolean })[];
  warnings: Warning[];
}

type Window = { window: [number, number]; wire: BankStatementWire };

const ibanKey = (s: string) => parseIban(s)?.iban ?? "";

export function statementFromPdf(windows: Window[], ctx: { docId: string; fileName: string; caseCif: string; companyName: string }): PdfStatementResult {
  const name = ctx.fileName;
  const fail = (attention: string, warnings: Warning[] = []): PdfStatementResult => ({ status: "failed", attention, accounts: [], warnings });
  const better = "Si puedes, sube el fichero Norma 43 de la banca online: se lee sin errores.";
  if (!windows.length) return fail(`No hemos podido leer «${name}».`);

  const first = windows[0].wire;
  if (first.document_type !== "bank_statement") {
    return fail(`«${name}» no parece un extracto bancario. Sube los movimientos de la cuenta descargados de la banca online. ${better}`, [
      { code: "doc_type_mismatch", message: `Expected bank_statement, got ${first.document_type}`, detail: { detected: first.document_type } },
    ]);
  }
  if (windows.some((w) => !w.wire.legible)) {
    return { status: "needs_review", attention: `No se lee bien «${name}». Sube el PDF descargado de la banca online, no una foto o un escaneo. ${better}`, accounts: [], warnings: [] };
  }
  // A person's account (DNI/NIE as the holder's ID): never part of a company's package.
  const person = windows.flatMap((w) => [w.wire.company_nif, ...w.wire.accounts.map((a) => a.holder_id)]).map(personalId).find(Boolean);
  if (person) return fail(personalAccountMessage(name), [{ code: "bank_personal_account", message: "Holder ID is a DNI/NIE" }]);
  const expected = cleanNif(ctx.caseCif);
  const nif = windows.map((w) => cleanNif(w.wire.company_nif)).find((n) => n && isValidCif(n)) ?? null;
  if (nif && expected && nif !== expected) {
    return fail(`«${name}» es de otra empresa (NIF ${nif}). Necesitamos los extractos de ${ctx.companyName} (${expected}).`, [
      { code: "doc_nif_mismatch", message: `NIF ${nif} does not match case CIF ${expected}`, detail: { found: nif, expected } },
    ]);
  }

  // Accounts across windows: the opening from the earliest page that prints it, the closing from the latest.
  type Acc = { iban: string; holder: string; currency: string; start: string | null; end: string | null; opening: number | null; closing: number | null };
  const accounts = new Map<string, Acc>();
  for (const { wire } of windows) {
    for (const a of wire.accounts) {
      const key = ibanKey(a.iban);
      const cur = accounts.get(key) ?? { iban: key, holder: "", currency: a.currency || "EUR", start: null, end: null, opening: null, closing: null };
      cur.holder ||= a.holder;
      const ps = parseDate(a.period_start);
      const pe = parseDate(a.period_end);
      if (ps && (!cur.start || ps < cur.start)) cur.start = ps;
      if (pe && (!cur.end || pe > cur.end)) cur.end = pe;
      cur.opening ??= a.opening_balance;
      if (a.closing_balance !== null) cur.closing = a.closing_balance;
      accounts.set(key, cur);
    }
  }
  const keys = [...accounts.keys()];

  // Movements on each window's own pages, to the account they name (or the only / first one).
  const rows = new Map<string, StatementRow[]>();
  let undated = 0;
  for (const { window, wire } of windows) {
    for (const m of wire.movements) {
      if (m.page < window[0] || m.page > window[1]) continue; // read from another window: that window has it
      const date = parseDate(m.date);
      if (!date || !Number.isFinite(m.amount) || m.amount === 0) {
        if (!date) undated++;
        continue;
      }
      const named = ibanKey(m.iban);
      const key = accounts.has(named) ? named : (keys[0] ?? "");
      if (!accounts.has(key)) accounts.set(key, { iban: key, holder: "", currency: "EUR", start: null, end: null, opening: null, closing: null });
      const list = rows.get(key) ?? [];
      list.push({ date, valueDate: parseDate(m.value_date), description: m.description.trim(), amount: Math.round(m.amount * 100) / 100, balance: m.balance, sourceRef: `doc:${ctx.docId}:page:${m.page}` });
      rows.set(key, list);
    }
  }
  if (![...rows.values()].some((r) => r.length)) return fail(`No hemos encontrado movimientos en «${name}». ${better}`);

  const warnings: Warning[] = [];
  if (undated) warnings.push({ code: "statement_rows_skipped", message: `«${name}»: ${undated} movimientos sin fecha legible no se han leído.` });
  const out: PdfStatementResult["accounts"] = [];
  let ok = true;
  for (const [key, list] of rows) {
    const a = accounts.get(key)!;
    const label = key ? `${name} · ${key.slice(-4)}` : name;
    const rec = reconcileRows(list, { opening: a.opening, closing: a.closing });
    if (!addsUp(rec) || undated) ok = false;
    warnings.push(...reconciliationWarnings(label, rec));
    out.push(toN43Account({ iban: key || null, holder: a.holder, currency: a.currency, label, rec, start: a.start, end: a.end }));
  }
  return ok
    ? { status: "parsed", attention: null, accounts: out, warnings }
    : {
        status: "needs_review",
        attention: `Los movimientos leídos de «${name}» no cuadran con sus saldos, así que no los usamos. Revisa que el PDF esté completo. ${better}`,
        accounts: out,
        warnings,
      };
}
