/**
 * Imports BORME Section A for one day (server-only, service role): read the BOE index, download each provincial PDF,
 * parse it, and store its light index rows (`borme_index`, `borme_pdfs`), plus the full acts of companies a lender has
 * confirmed (`borme_company_acts`). Idempotent per PDF; a day is recorded in `borme_days` so the daily job and the
 * backfill skip it next time. `pruneIndex` drops index days older than the retention window.
 */
import "server-only";
import type { AdminClient } from "../borrower/access.ts";
import { fetchSectionA, type DayImport } from "./fetch.ts";
import { pdfParts, toActRows, toCompanyActs, toIndexRows } from "./rows.ts";

export type { DayImport };

/** Months of index kept (env BORME_RETENTION_MONTHS, default 24): ~0.45 MB a day. */
export const retentionMonths = () => {
  const n = Number(process.env.BORME_RETENTION_MONTHS);
  return Number.isInteger(n) && n > 0 ? n : 24;
};

async function insertChunks(db: AdminClient, table: string, rows: object[], size = 1000, upsertOn?: string) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = upsertOn ? await db.from(table).upsert(chunk, { onConflict: upsertOn, ignoreDuplicates: true }) : await db.from(table).insert(chunk);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

/** Registry sheets whose full acts are kept (companies a lender has confirmed). */
export async function watchedSheets(db: AdminClient): Promise<Set<string>> {
  const { data } = await db.from("borme_sheets").select("sheet").in("status", ["ready", "fetching"]);
  return new Set((data ?? []).map((r) => r.sheet as string));
}

/** Imports one day unless it is already done (`force` re-imports). Never throws; failures are recorded. */
export async function ingestDay(db: AdminClient, day: string, opts: { force?: boolean; fetchImpl?: typeof fetch; watched?: Set<string> } = {}): Promise<DayImport> {
  if (!opts.force) {
    const { data: done } = await db.from("borme_days").select("status").eq("day", day).maybeSingle();
    if (done && done.status !== "failed") return { day, status: done.status as DayImport["status"], pdfs: 0, entries: 0, acts: 0, warnings: [], skipped: true };
  }
  const watched = opts.watched ?? (await watchedSheets(db));
  let result: DayImport;
  try {
    result = await fetchSectionA(day, {
      fetchImpl: opts.fetchImpl,
      onPdf: async (pdf, entries) => {
        const meta = { publishedOn: day, bormeId: pdf.id, province: pdf.province };
        const { issue, seq } = pdfParts(pdf.id);
        await db.from("borme_pdfs").upsert({ published_on: day, issue, seq, province: pdf.province });
        await db.from("borme_index").delete().eq("published_on", day).eq("seq", seq);
        await insertChunks(db, "borme_index", toIndexRows(entries, meta));
        const acts = toCompanyActs(toActRows(entries, meta)).filter((a) => watched.has(a.registry_sheet!));
        if (acts.length) await insertChunks(db, "borme_company_acts", acts, 500, "borme_id,entry_number,act_index");
      },
    });
  } catch (e) {
    result = { day, status: "failed", pdfs: 0, entries: 0, acts: 0, warnings: [], error: (e as Error).message.slice(0, 300) };
  }
  await db.from("borme_days").upsert({
    day,
    status: result.status,
    pdfs: result.pdfs,
    entries: result.entries,
    acts: result.acts,
    warnings: result.warnings.length,
    error: result.error ?? null,
    fetched_at: new Date().toISOString(),
  });
  return result;
}

/** First day kept by the retention window, for `today`. */
export function retentionStart(today: string, months = retentionMonths()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Drops index rows older than the retention window and marks those days `pruned` (so they are not re-imported).
 * Full acts of confirmed companies are kept: they are small and are the company's history.
 */
export async function pruneIndex(db: AdminClient, today: string): Promise<string> {
  const before = retentionStart(today);
  await db.from("borme_index").delete().lt("published_on", before);
  await db.from("borme_pdfs").delete().lt("published_on", before);
  await db.from("borme_days").update({ status: "pruned" }).lt("day", before).eq("status", "ingested");
  return before;
}

/** Weekdays from `from` to `to` inclusive (BORME is published Monday to Friday). */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
