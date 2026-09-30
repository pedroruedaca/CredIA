/**
 * Imports BORME Section A for a date range into borme_acts (days already imported are skipped).
 *
 *   npm run borme:backfill -- --from 2023-10-01 --to 2026-09-30 [--force]
 *
 * About 250 days a year, ~50 provincial PDFs a day; it can be stopped and resumed.
 */
import { ingestDay, weekdays } from "../src/lib/borme/ingest.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { todayMadrid } from "../src/lib/format.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const from = arg("from");
const to = arg("to") ?? todayMadrid();
if (!from || !DATE.test(from) || !DATE.test(to)) {
  console.error("Uso: npm run borme:backfill -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--force]");
  process.exit(1);
}

const db = createAdminClient();
const days = weekdays(from, to);
let acts = 0;
for (const [i, day] of days.entries()) {
  const r = await ingestDay(db, day, { force: process.argv.includes("--force") });
  acts += r.acts;
  const line = r.skipped ? "ya importado" : r.status === "ingested" ? `${r.pdfs} PDF · ${r.entries} anuncios · ${r.acts} actos · ${r.warnings.length} avisos` : r.status === "no_issue" ? "sin BORME" : `ERROR ${r.error}`;
  console.log(`[${i + 1}/${days.length}] ${day} ${line}`);
}
console.log(`Hecho: ${acts} actos importados.`);
