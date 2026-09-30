/**
 * Imports BORME Section A for one day into `borme_acts` (server-only, service role): read the BOE index, download
 * each provincial PDF, extract its text, parse it, and replace that PDF's rows. Idempotent per PDF; a day is
 * recorded in `borme_days` so the daily job and the backfill skip it next time.
 */
import "server-only";
import type { AdminClient } from "../borrower/access.ts";
import { fetchSectionA, type DayImport } from "./fetch.ts";

export type { DayImport };

async function insertChunks(db: AdminClient, rows: object[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from("borme_acts").insert(rows.slice(i, i + size));
    if (error) throw new Error(`insert borme_acts: ${error.message}`);
  }
}

/** Imports one day unless it is already done (`force` re-imports). Never throws; failures are recorded. */
export async function ingestDay(db: AdminClient, day: string, opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<DayImport> {
  if (!opts.force) {
    const { data: done } = await db.from("borme_days").select("status").eq("day", day).maybeSingle();
    if (done && done.status !== "failed") return { day, status: done.status as DayImport["status"], pdfs: 0, entries: 0, acts: 0, warnings: [], skipped: true };
  }
  let result: DayImport;
  try {
    result = await fetchSectionA(day, {
      fetchImpl: opts.fetchImpl,
      onPdf: async (pdfId, rows) => {
        await db.from("borme_acts").delete().eq("borme_id", pdfId);
        await insertChunks(db, rows);
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

/** Weekdays from `from` to `to` inclusive (BORME is published Monday to Friday). */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
