/**
 * Builds the BORME index for a date range (days already imported are skipped). Only the light index is stored,
 * plus full acts for companies a lender has confirmed. Defaults to the retention window (BORME_RETENTION_MONTHS,
 * 24 months): days older than that would be pruned by the daily job anyway.
 *
 *   npm run borme:backfill -- [--from 2024-10-01] [--to 2026-09-30] [--force]
 *
 * About 250 days a year, ~50 provincial PDFs a day (~15 s a day); it can be stopped and resumed.
 */
import { ingestDay, retentionStart, watchedSheets, weekdays } from "../src/lib/borme/ingest.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { todayMadrid } from "../src/lib/format.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const to = arg("to") ?? todayMadrid();
const from = arg("from") ?? retentionStart(todayMadrid());
if (!DATE.test(from) || !DATE.test(to)) {
  console.error("Uso: npm run borme:backfill -- [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--force]");
  process.exit(1);
}
if (from < retentionStart(todayMadrid())) console.warn(`Aviso: los días anteriores a ${retentionStart(todayMadrid())} los borra el proceso diario (retención BORME_RETENTION_MONTHS).`);

const db = createAdminClient();
const days = weekdays(from, to);
const watched = await watchedSheets(db);
let acts = 0;
for (const [i, day] of days.entries()) {
  const r = await ingestDay(db, day, { force: process.argv.includes("--force"), watched });
  acts += r.acts;
  const line = r.skipped ? "ya importado" : r.status === "ingested" ? `${r.pdfs} PDF · ${r.entries} anuncios · ${r.acts} actos · ${r.warnings.length} avisos` : r.status === "no_issue" ? "sin BORME" : `ERROR ${r.error}`;
  console.log(`[${i + 1}/${days.length}] ${day} ${line}`);
}
console.log(`Hecho: ${acts} actos leídos (solo se guarda el índice y los actos de empresas confirmadas).`);
