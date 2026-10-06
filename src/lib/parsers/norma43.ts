/**
 * Norma 43 (AEB Cuaderno 43) parser: fixed-width 80-character records.
 *   11 account header · 22 movement · 23 movement concept (up to 5) · 33 account totals · 88 end of file
 * Amounts are 14 digits with 2 implied decimals; debit/credit keys are 1 = debe (cargo), 2 = haber (abono).
 * Pure. Never throws on bad data: malformed lines and totals that don't reconcile become warnings.
 *
 * Each movement is classified by src/lib/bank/classify.ts (concept text, AEB common concept, transfers between the
 * file's own accounts). The pipeline classifies again over all of a case's bank files together (see recompute), so
 * transfers between accounts in different files are found too.
 */
import { classifyAccounts, type BankCategory, type ClassificationBasis } from "../bank/classify.ts";
import type { Result, Warning } from "../types.ts";

export type TxCategory = BankCategory;

export interface N43Transaction {
  bookingDate: string; // YYYY-MM-DD
  valueDate: string;
  amount: number; // + inflow (abono), − outflow (cargo)
  commonConcept: string; // 2 digits
  ownConcept: string; // 3 digits
  document: string;
  reference1: string;
  reference2: string;
  description: string; // record 23 concepts joined
  category: TxCategory;
  /** What decided the category, and which rule (see classify.ts). */
  categoryBasis?: ClassificationBasis;
  categoryRule?: string;
  sourceRef: string; // doc:<id>:line:<n>
}

export interface N43Account {
  bank: string; // 4-digit entity code
  branch: string;
  accountMasked: string; // "2100 0418 ****5678"
  currency: string; // ISO numeric, 978 = EUR
  start: string;
  end: string;
  name: string;
  openingBalance: number;
  closingBalance: number | null; // from record 33
  totals: { debits: number; credits: number; debitCount: number; creditCount: number } | null;
  transactions: N43Transaction[];
  /**
   * false for a statement without running balances (some Excel/CSV exports): its movements count, but its balances
   * are unknown (opening 0 is a placeholder). Norma 43 always carries balances.
   */
  balancesKnown?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** YYMMDD → YYYY-MM-DD (years 00-79 → 20xx). */
export function n43Date(s: string): string | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = +s.slice(0, 2);
  const mm = +s.slice(2, 4);
  const dd = +s.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy < 80 ? 2000 + yy : 1900 + yy}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
}

/** 14-digit amount with 2 implied decimals; key 1 = debit (negative), 2 = credit (positive). */
export function n43Amount(digits: string, key: string): number | null {
  if (!/^\d{14}$/.test(digits) || (key !== "1" && key !== "2")) return null;
  const v = Number(digits) / 100;
  return key === "1" ? -v : v;
}

function maskAccount(bank: string, branch: string, account: string): string {
  return `${bank} ${branch} ****${account.slice(-4)}`;
}

export function parseNorma43(text: string, opts: { docId: string }): Result<N43Account[]> {
  const warnings: Warning[] = [];
  const accounts: N43Account[] = [];
  let current: N43Account | null = null;
  let lastTx: N43Transaction | null = null;
  let recordsSeen = 0;
  let declaredRecords: number | null = null;
  const bad: number[] = [];

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\s+$/, "").padEnd(80, " ");
    if (!raw.trim()) return;
    const code = line.slice(0, 2);
    recordsSeen++;

    switch (code) {
      case "11": {
        const start = n43Date(line.slice(20, 26));
        const end = n43Date(line.slice(26, 32));
        const opening = n43Amount(line.slice(33, 47), line[32]);
        if (!start || !end || opening === null) {
          bad.push(lineNo);
          current = null;
          return;
        }
        const bank = line.slice(2, 6);
        const branch = line.slice(6, 10);
        current = {
          bank,
          branch,
          accountMasked: maskAccount(bank, branch, line.slice(10, 20)),
          currency: line.slice(47, 50),
          start,
          end,
          name: line.slice(51, 77).trim(),
          openingBalance: opening,
          closingBalance: null,
          totals: null,
          transactions: [],
        };
        accounts.push(current);
        lastTx = null;
        return;
      }
      case "22": {
        if (!current) return void bad.push(lineNo);
        const bookingDate = n43Date(line.slice(10, 16));
        const valueDate = n43Date(line.slice(16, 22));
        const amount = n43Amount(line.slice(28, 42), line[27]);
        if (!bookingDate || !valueDate || amount === null) return void bad.push(lineNo);
        lastTx = {
          bookingDate,
          valueDate,
          amount,
          commonConcept: line.slice(22, 24),
          ownConcept: line.slice(24, 27),
          document: line.slice(42, 52).trim(),
          reference1: line.slice(52, 64).trim(),
          reference2: line.slice(64, 80).trim(),
          description: "",
          category: "other_inflow",
          sourceRef: `doc:${opts.docId}:line:${lineNo}`,
        };
        current.transactions.push(lastTx);
        return;
      }
      case "23": {
        if (!lastTx) return void bad.push(lineNo);
        const text23 = `${line.slice(4, 42).trim()} ${line.slice(42, 80).trim()}`.trim();
        lastTx.description = `${lastTx.description} ${text23}`.trim();
        return;
      }
      case "24": // currency equivalence: informational
        return;
      case "33": {
        if (!current) return void bad.push(lineNo);
        const debits = n43Amount(line.slice(25, 39), "2");
        const credits = n43Amount(line.slice(44, 58), "2");
        const closing = n43Amount(line.slice(59, 73), line[58]);
        if (debits === null || credits === null || closing === null) return void bad.push(lineNo);
        current.totals = { debits, credits, debitCount: Number(line.slice(20, 25)), creditCount: Number(line.slice(39, 44)) };
        current.closingBalance = closing;
        current = null;
        lastTx = null;
        return;
      }
      case "88": {
        const n = Number(line.slice(20, 26));
        declaredRecords = Number.isFinite(n) ? n : null;
        recordsSeen--; // the 88 record is not counted in its own total
        return;
      }
      default:
        bad.push(lineNo);
    }
  });

  if (bad.length) {
    warnings.push({ code: "n43_malformed_lines", message: `${bad.length} líneas no tienen el formato Norma 43.`, detail: { lines: bad.slice(0, 20) } });
  }
  // Exporters differ on whether the 88 record counts itself: accept both.
  if (declaredRecords !== null && declaredRecords !== recordsSeen && declaredRecords !== recordsSeen + 1) {
    warnings.push({ code: "n43_record_count", message: `El fichero declara ${declaredRecords} registros y contiene ${recordsSeen}.`, detail: { declared: declaredRecords, found: recordsSeen } });
  }
  if (accounts.length === 0) warnings.push({ code: "n43_no_accounts", message: "El fichero no contiene cuentas Norma 43." });

  classifyAccounts(accounts);
  for (const a of accounts) {
    const debits = r2(-a.transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const credits = r2(a.transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
    const detail = { account: a.accountMasked };
    if (!a.totals) {
      warnings.push({ code: "n43_missing_totals", message: `La cuenta ${a.accountMasked} no tiene registro de totales (33).`, detail });
      continue;
    }
    if (Math.abs(a.totals.debits - debits) > 0.005 || Math.abs(a.totals.credits - credits) > 0.005) {
      warnings.push({ code: "n43_totals_mismatch", message: `Los movimientos de ${a.accountMasked} no suman los totales del fichero.`, detail: { ...detail, declared: a.totals, computed: { debits, credits } } });
    }
    const expectedClosing = r2(a.openingBalance + credits - debits);
    if (a.closingBalance !== null && Math.abs(expectedClosing - a.closingBalance) > 0.005) {
      warnings.push({ code: "n43_balance_mismatch", message: `El saldo final de ${a.accountMasked} no cuadra con el inicial y los movimientos.`, detail: { ...detail, expected: expectedClosing, declared: a.closingBalance } });
    }
    if (a.currency !== "978") warnings.push({ code: "n43_non_eur", message: `La cuenta ${a.accountMasked} no está en euros (divisa ${a.currency}).`, detail });
  }

  return { data: accounts, warnings };
}

/** Lowest running balance of an account (to spot overdrafts), in date order. */
export function minRunningBalance(a: N43Account): { balance: number; date: string } {
  let bal = a.openingBalance;
  let min = { balance: bal, date: a.start };
  for (const t of [...a.transactions].sort((x, y) => x.bookingDate.localeCompare(y.bookingDate))) {
    bal = r2(bal + t.amount);
    if (bal < min.balance) min = { balance: bal, date: t.bookingDate };
  }
  return min;
}
