/**
 * Reads one company's BORME acts on demand (server-only, service role): the light index says in which provincial
 * PDFs its registry sheet appears; those PDFs are downloaded and parsed now, and the company's acts are stored in
 * `borme_company_acts`. `borme_sheets` tracks the state so the case view can show "Consultando el BORME…".
 */
import "server-only";
import type { AdminClient } from "../borrower/access.ts";
import { fetchPdfEntries } from "./fetch.ts";
import { planSheetFetch, type SheetPdf } from "./ondemand-plan.ts";
import { toActRows, toCompanyActs } from "./rows.ts";

/** Upper bound per request: at ~2 s a PDF with 4 in parallel this stays well inside the 300 s function limit. */
const MAX_PDFS = 300;
const PARALLEL = 4;
/** A fetch still "fetching" after this long died with its request. */
export const STALE_FETCH_MS = 10 * 60 * 1000;

export async function fetchSheetActs(db: AdminClient, sheet: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<{ status: "ready" | "failed"; pdfs: number; acts: number }> {
  await db.from("borme_sheets").upsert({ sheet, status: "fetching", error: null, updated_at: new Date().toISOString() });
  try {
    const { data: index } = await db.from("borme_index").select("published_on, seq, entry_number").eq("registry_sheet", sheet).limit(5000);
    const days = [...new Set((index ?? []).map((r) => r.published_on as string))];
    const pdfRows: { published_on: string; issue: number; seq: number; province: string }[] = [];
    for (let i = 0; i < days.length; i += 200) {
      const { data } = await db.from("borme_pdfs").select("published_on, issue, seq, province").in("published_on", days.slice(i, i + 200));
      pdfRows.push(...((data ?? []) as typeof pdfRows));
    }
    const plan = planSheetFetch((index ?? []) as { published_on: string; seq: number; entry_number: number }[], pdfRows);
    const todo = plan.pdfs.slice(-MAX_PDFS); // most recent first if a company has more than we can read at once

    let acts = 0;
    let failed = 0;
    const one = async (p: SheetPdf) => {
      try {
        const { entries } = await fetchPdfEntries(p.url, p.province, opts.fetchImpl);
        const mine = entries.filter((e) => p.entries.has(e.number) && e.registry?.sheet === sheet);
        const rows = toCompanyActs(toActRows(mine, { publishedOn: p.publishedOn, bormeId: p.bormeId, province: p.province }));
        if (rows.length) {
          const { error } = await db.from("borme_company_acts").upsert(rows, { onConflict: "borme_id,entry_number,act_index", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        }
        acts += rows.length;
      } catch {
        failed++;
      }
    };
    for (let i = 0; i < todo.length; i += PARALLEL) await Promise.all(todo.slice(i, i + PARALLEL).map(one));

    const allFailed = todo.length > 0 && failed === todo.length;
    const note = [
      failed ? `${failed} de ${todo.length} boletines no se pudieron leer` : null,
      plan.pdfs.length > todo.length ? `se han leído los ${todo.length} boletines más recientes de ${plan.pdfs.length}` : null,
    ].filter(Boolean).join("; ");
    await db.from("borme_sheets").upsert({ sheet, status: allFailed ? "failed" : "ready", pdfs: todo.length - failed, error: note || null, updated_at: new Date().toISOString() });
    return { status: allFailed ? "failed" : "ready", pdfs: todo.length - failed, acts };
  } catch (e) {
    await db.from("borme_sheets").upsert({ sheet, status: "failed", error: (e as Error).message.slice(0, 300), updated_at: new Date().toISOString() });
    return { status: "failed", pdfs: 0, acts: 0 };
  }
}
