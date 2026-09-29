/**
 * Holded connector — borrower pastes an API key created in Holded
 * (Configuración → Desarrolladores → API → "Añadir token de API") with read-only accounting scopes.
 *
 * Holded API v2: base https://api.holded.com, `Authorization: Bearer <key>`.
 *   GET /api/v2/accounting-accounts   scope accounting:chart-of-accounts.read
 *   GET /api/v2/ledger-entries        scope accounting:daily-ledger.read
 *       required start_date/end_date, cursor pagination (cursor, has_more), limit ≤ 200
 *
 * Output: LedgerBalance[] per period — the same shape as a sumas y saldos upload, so everything
 * downstream (PGC mapping, KPIs, checks) is source-agnostic.
 *
 * Never log the API key. Never return it in errors.
 */
import type { LedgerBalance, Period, Result, Warning } from "../types.ts";
import { toNumber } from "../types.ts";
import { aggregateByAccount, toPgc3 } from "../pgc/mapping.ts";

export const HOLDED_BASE_URL = "https://api.holded.com";
export const HOLDED_SCOPES = {
  chartOfAccounts: "accounting:chart-of-accounts.read",
  ledger: "accounting:daily-ledger.read",
} as const;
export type HoldedScope = (typeof HOLDED_SCOPES)[keyof typeof HOLDED_SCOPES];

/** Spanish labels shown to the borrower when a permission is missing. Verify against Holded's UI. */
export const SCOPE_LABELS_ES: Record<HoldedScope, string> = {
  "accounting:chart-of-accounts.read": "Contabilidad → Plan de cuentas (lectura)",
  "accounting:daily-ledger.read": "Contabilidad → Libro diario (lectura)",
};

// ---------------------------------------------------------------- API types

export interface HoldedAccount {
  id: string;
  number: number;
  name: string;
  group: string | null;
  debit: string;
  credit: string;
  balance: string;
  archived: boolean;
}

export interface HoldedLedgerLine {
  entry_number: number;
  line: number;
  date: string; // YYYY-MM-DD
  type: string | null;
  description: string;
  doc_description: string | null;
  account: number;
  debit: string;
  credit: string;
  tags: string[];
  checked: boolean;
}

interface Page<T> { items: T[]; cursor?: string | null; has_more?: boolean }

// ---------------------------------------------------------------- errors

export type HoldedErrorCode = "invalid_key" | "missing_scope" | "rate_limited" | "http_error" | "network" | "bad_response";

export class HoldedError extends Error {
  constructor(
    public code: HoldedErrorCode,
    message: string,
    public status?: number,
    public scope?: HoldedScope,
  ) {
    super(message);
    this.name = "HoldedError";
  }
}

// ---------------------------------------------------------------- client

export interface HoldedClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export class HoldedClient {
  readonly #key: string;
  #fetch: typeof fetch;
  #base: string;
  #sleep: (ms: number) => Promise<void>;
  #maxRetries: number;
  requestCount = 0;

  constructor(apiKey: string, opts: HoldedClientOptions = {}) {
    const key = apiKey.trim();
    if (key.length < 16) throw new HoldedError("invalid_key", "The API key looks incomplete");
    this.#key = key;
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.#base = opts.baseUrl ?? HOLDED_BASE_URL;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#maxRetries = opts.maxRetries ?? 5;
  }

  get keyLast4(): string { return this.#key.slice(-4); }

  async #get<T>(path: string, params: Record<string, string | number | boolean | undefined>, scope: HoldedScope): Promise<T> {
    const url = new URL(path, this.#base);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        this.requestCount++;
        res = await this.#fetch(url, { headers: { Authorization: `Bearer ${this.#key}`, Accept: "application/json" } });
      } catch {
        if (attempt < this.#maxRetries) { await this.#sleep(backoff(attempt)); continue; }
        throw new HoldedError("network", "Could not reach Holded");
      }
      if (res.ok) {
        try { return (await res.json()) as T; }
        catch { throw new HoldedError("bad_response", `Holded returned non-JSON for ${path}`, res.status); }
      }
      if (res.status === 401) throw new HoldedError("invalid_key", "Holded rejected the API key", 401);
      if (res.status === 403) throw new HoldedError("missing_scope", `The API key lacks permission ${scope}`, 403, scope);
      if ((res.status === 429 || res.status >= 500) && attempt < this.#maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.#sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      throw new HoldedError(res.status === 429 ? "rate_limited" : "http_error", `Holded ${path} failed with HTTP ${res.status}`, res.status);
    }
  }

  async listAccounts(params: { startDate?: string; endDate?: string; includeEmpty?: boolean; archived?: boolean } = {}): Promise<HoldedAccount[]> {
    const page = await this.#get<Page<HoldedAccount>>("/api/v2/accounting-accounts", {
      start_date: params.startDate, end_date: params.endDate,
      include_empty: params.includeEmpty, archived: params.archived,
    }, HOLDED_SCOPES.chartOfAccounts);
    if (!Array.isArray(page?.items)) throw new HoldedError("bad_response", "Unexpected chart-of-accounts response");
    return page.items;
  }

  async *ledgerLines(params: { startDate: string; endDate: string; account?: number; limit?: number }): AsyncGenerator<HoldedLedgerLine> {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.#get<Page<HoldedLedgerLine>>("/api/v2/ledger-entries", {
        start_date: params.startDate, end_date: params.endDate,
        limit: params.limit ?? 200, account: params.account, cursor,
      }, HOLDED_SCOPES.ledger);
      if (!Array.isArray(page?.items)) throw new HoldedError("bad_response", "Unexpected ledger response");
      for (const l of page.items) yield l;
      const next = page.has_more ? page.cursor ?? undefined : undefined;
      if (next && seen.has(next)) throw new HoldedError("bad_response", "Ledger pagination cursor repeated");
      if (next) seen.add(next);
      cursor = next;
    } while (cursor);
  }

  async fetchLedger(startDate: string, endDate: string): Promise<HoldedLedgerLine[]> {
    const out: HoldedLedgerLine[] = [];
    for await (const l of this.ledgerLines({ startDate, endDate })) out.push(l);
    return out;
  }
}

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);

// ---------------------------------------------------------------- key verification

export interface KeyCheck {
  ok: boolean;
  invalidKey: boolean;
  missingScopes: HoldedScope[];
  /** Human message for the borrower (Spanish). */
  message: string;
}

/** Cheap probe of both required scopes before we start a sync. */
export async function verifyHoldedKey(client: HoldedClient, today: string): Promise<KeyCheck> {
  const missing: HoldedScope[] = [];
  const probes: [HoldedScope, () => Promise<unknown>][] = [
    [HOLDED_SCOPES.chartOfAccounts, () => client.listAccounts({ startDate: today, endDate: today })],
    [HOLDED_SCOPES.ledger, async () => { for await (const _ of client.ledgerLines({ startDate: today, endDate: today, limit: 1 })) break; }],
  ];
  for (const [scope, probe] of probes) {
    try { await probe(); }
    catch (e) {
      if (e instanceof HoldedError && e.code === "invalid_key")
        return { ok: false, invalidKey: true, missingScopes: [], message: "La clave de API no es válida. Genera una nueva en Holded y vuelve a pegarla." };
      if (e instanceof HoldedError && e.code === "missing_scope") { missing.push(scope); continue; }
      throw e;
    }
  }
  if (missing.length)
    return {
      ok: false, invalidKey: false, missingScopes: missing,
      message: `A la clave le faltan permisos. Edítala en Holded y activa: ${missing.map((s) => SCOPE_LABELS_ES[s]).join("; ")}.`,
    };
  return { ok: true, invalidKey: false, missingScopes: [], message: "Clave verificada." };
}

// ---------------------------------------------------------------- closing / opening detection

export interface EntryClassifierConfig {
  /** Holded `type` values meaning closing or regularisation. VERIFY against a real account (week 1). */
  closingTypes: string[];
  openingTypes: string[];
  closingDescription: RegExp;
  regularisationDescription: RegExp;
  openingDescription: RegExp;
}

export const DEFAULT_CLASSIFIER: EntryClassifierConfig = {
  closingTypes: ["closing", "cierre", "close"],
  openingTypes: ["opening", "apertura", "open"],
  closingDescription: /asiento de cierre|cierre del ejercicio|cierre contable/i,
  regularisationDescription: /regulariz/i,
  openingDescription: /asiento de apertura|apertura del ejercicio/i,
};

type EntryKind = "normal" | "closing" | "regularisation" | "opening";

interface Entry { key: string; date: string; lines: HoldedLedgerLine[]; kind: EntryKind; reason?: string }

const net = (l: HoldedLedgerLine) => toNumber(l.debit) - toNumber(l.credit);
const grp = (l: HoldedLedgerLine) => String(l.account).charAt(0);
const isBalanceSheet = (l: HoldedLedgerLine) => "12345".includes(grp(l));
const isPnl = (l: HoldedLedgerLine) => grp(l) === "6" || grp(l) === "7";
const is129 = (l: HoldedLedgerLine) => String(l.account).startsWith("129");

export function groupEntries(lines: HoldedLedgerLine[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const l of lines) {
    const key = `${l.date.slice(0, 4)}#${l.entry_number}`;
    const e = map.get(key) ?? { key, date: l.date, lines: [], kind: "normal" as EntryKind };
    e.lines.push(l);
    if (l.date > e.date) e.date = l.date;
    map.set(key, e);
  }
  return [...map.values()];
}

/**
 * Classify entries so a period's trial balance is PRE-closing:
 *  - regularisation (6/7 → 129) and closing (all balances → 0) are excluded
 *  - opening entries are kept (they carry prior-year balances) unless reconstructing from history
 */
export function classifyEntries(entries: Entry[], cfg: EntryClassifierConfig = DEFAULT_CLASSIFIER): Entry[] {
  const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();
  const text = (e: Entry) => e.lines.map((l) => `${l.description ?? ""} ${l.doc_description ?? ""}`).join(" ");

  for (const e of entries) {
    const types = new Set(e.lines.map((l) => lc(l.type)));
    const t = text(e);
    if (cfg.closingTypes.some((x) => types.has(x)) || cfg.closingDescription.test(t)) { e.kind = "closing"; e.reason = "type/description"; continue; }
    if (cfg.openingTypes.some((x) => types.has(x)) || cfg.openingDescription.test(t)) { e.kind = "opening"; e.reason = "type/description"; continue; }
    if (cfg.regularisationDescription.test(t)) { e.kind = "regularisation"; e.reason = "description"; continue; }
    // Structural regularisation: only 6/7 and 129, at least one of each.
    if (e.lines.length >= 2 && e.lines.some(is129) && e.lines.some(isPnl) && e.lines.every((l) => isPnl(l) || is129(l))) {
      e.kind = "regularisation"; e.reason = "structure: 6/7 ↔ 129"; continue;
    }
  }

  // Structural closing: a balance-sheet-only entry on the last date of a fiscal year whose lines
  // cancel the running balance of ≥ 80% of the accounts it touches.
  const byYear = new Map<string, Entry[]>();
  for (const e of entries) {
    const y = e.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  for (const [, yearEntries] of byYear) {
    const lastDate = yearEntries.reduce((m, e) => (e.date > m ? e.date : m), "");
    for (const cand of yearEntries) {
      if (cand.kind !== "normal" || cand.date !== lastDate || cand.lines.length < 3 || !cand.lines.every(isBalanceSheet)) continue;
      const running = new Map<number, number>();
      for (const e of yearEntries) {
        if (e === cand || e.kind === "closing") continue;
        for (const l of e.lines) running.set(l.account, (running.get(l.account) ?? 0) + net(l));
      }
      const cancelled = cand.lines.filter((l) => Math.abs((running.get(l.account) ?? 0) + net(l)) < 0.01).length;
      if (cancelled / cand.lines.length >= 0.8) { cand.kind = "closing"; cand.reason = "structure: cancels year-end balances"; }
    }
  }
  return entries;
}

// ---------------------------------------------------------------- trial balance

export interface HoldedTrialBalance {
  period: Period;
  balances: LedgerBalance[];
  linesFetched: number;
  excluded: { entry: string; kind: EntryKind; reason?: string; lines: number }[];
  openingReconstructed: boolean;
  /** Raw lines, for storage in raw/holded/<case>/<sync>.json (audit). */
  raw: HoldedLedgerLine[];
}

export interface PullOptions {
  classifier?: EntryClassifierConfig;
  /** Fiscal year start for the period (defaults to period.start). */
  fiscalYearStart?: string;
  /** How far back to look when reconstructing opening balances. */
  booksStart?: string;
}

/**
 * Build a pre-closing trial balance for `period` from Holded ledger lines.
 * If the period starts at the fiscal-year start and Holded has no opening entry (year never formally
 * closed in Holded), balance-sheet opening balances are reconstructed from prior history.
 */
export async function pullHoldedTrialBalance(
  client: HoldedClient,
  period: Period,
  opts: PullOptions = {},
): Promise<Result<HoldedTrialBalance>> {
  const cfg = opts.classifier ?? DEFAULT_CLASSIFIER;
  const warnings: Warning[] = [];
  const fyStart = opts.fiscalYearStart ?? period.start;

  const raw = await client.fetchLedger(period.start, period.end);
  const entries = classifyEntries(groupEntries(raw), cfg);

  const kept = entries.filter((e) => e.kind === "normal" || e.kind === "opening");
  const excluded = entries
    .filter((e) => e.kind === "closing" || e.kind === "regularisation")
    .map((e) => ({ entry: e.key, kind: e.kind, reason: e.reason, lines: e.lines.length }));

  const rows: { account: string; debit: number; credit: number }[] = kept.flatMap((e) =>
    e.lines.map((l) => ({ account: String(l.account), debit: toNumber(l.debit), credit: toNumber(l.credit) })),
  );

  // Opening balances
  const hasOpening = entries.some((e) => e.kind === "opening" && e.date === fyStart);
  let openingReconstructed = false;
  let history: HoldedLedgerLine[] = [];
  if (period.start === fyStart && !hasOpening) {
    const dayBefore = shiftDate(fyStart, -1);
    history = await client.fetchLedger(opts.booksStart ?? shiftDate(fyStart, -365 * 15), dayBefore);
    if (history.length) {
      // Cumulative balance-sheet balances: drop closing entries and the opening entries that mirror
      // them (dated the day after a closing). Keep an unpaired opening entry — that is the migration
      // entry when the books started in Holded mid-life. Keep regularisations so prior results land in 129.
      const classified = classifyEntries(groupEntries(history), cfg);
      const closingDates = new Set(classified.filter((e) => e.kind === "closing").map((e) => shiftDate(e.date, 1)));
      const hist = classified.filter((e) =>
        e.kind === "normal" || e.kind === "regularisation" || (e.kind === "opening" && !closingDates.has(e.date)));
      for (const e of hist) for (const l of e.lines) {
        if (!isBalanceSheet(l)) continue;
        rows.push({ account: String(l.account), debit: toNumber(l.debit), credit: toNumber(l.credit) });
      }
      openingReconstructed = true;
      warnings.push({ code: "holded_opening_reconstructed", message: `Sin asiento de apertura el ${fyStart}; saldos iniciales reconstruidos a partir de ${history.length} apuntes anteriores.` });
    }
  }

  const refBase = `holded:ledger:${period.start}..${period.end}`;
  const balances = aggregateByAccount(rows, "holded", (a) => `${refBase}:acct:${a}`);

  // Post-check: if every balance-sheet account nets to ~0, a closing entry slipped through.
  const bs = balances.filter((b) => "12345".includes(b.pgc3[0]));
  if (bs.length > 3 && bs.every((b) => Math.abs(b.debit - b.credit) < 0.01)) {
    warnings.push({ code: "holded_closing_entries_suspected", message: "Todas las cuentas de balance suman cero: probablemente no se detectó un asiento de cierre. Revisa la configuración del clasificador de asientos." });
  }
  const tbDiff = balances.reduce((s, b) => s + b.debit - b.credit, 0);
  if (Math.abs(tbDiff) > 0.05) {
    warnings.push({ code: "holded_tb_unbalanced", message: `El debe y el haber del sumas y saldos difieren en ${tbDiff.toFixed(2)} €`, detail: { diff: tbDiff } });
  }
  if (!raw.length) warnings.push({ code: "holded_no_entries", message: `No hay apuntes entre ${period.start} y ${period.end}.` });

  return {
    data: { period, balances, linesFetched: raw.length + history.length, excluded, openingReconstructed, raw: [...history, ...raw] },
    warnings,
  };
}

/**
 * Compare the ledger-derived TB with Holded's chart-of-accounts totals for the same dates.
 * Informational only: the semantics of the chart's debit/credit fields over a date range are unverified,
 * and after a year close the chart likely includes the regularisation (P&L nets to 0) — expect
 * mismatches on closed years until verified against a real account.
 */
export function reconcileWithChart(balances: LedgerBalance[], chart: HoldedAccount[], tolerance = 1): Warning[] {
  const ours = new Map<string, number>();
  for (const b of balances) if ("67".includes(b.pgc3[0])) ours.set(b.account, b.debit - b.credit);
  const out: Warning[] = [];
  for (const a of chart) {
    const acct = String(a.number);
    if (!"67".includes(acct[0])) continue; // compare P&L flows only; BS depends on opening semantics
    const theirs = toNumber(a.debit) - toNumber(a.credit);
    const mine = ours.get(acct) ?? 0;
    if (Math.abs(theirs - mine) > tolerance) {
      out.push({ code: "holded_chart_mismatch", message: `Cuenta ${acct} (${a.name}): libro diario ${mine.toFixed(2)} € frente a plan de cuentas ${theirs.toFixed(2)} €`, detail: { account: acct, ledger: mine, chart: theirs } });
    }
  }
  return out;
}

/** Account names from the chart, to enrich LedgerBalance.name. */
export function applyAccountNames(balances: LedgerBalance[], chart: HoldedAccount[]): LedgerBalance[] {
  const names = new Map(chart.map((a) => [String(a.number), a.name]));
  return balances.map((b) => ({ ...b, name: b.name ?? names.get(b.account), pgc3: b.pgc3 || toPgc3(b.account) }));
}

function shiftDate(d: string, days: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
