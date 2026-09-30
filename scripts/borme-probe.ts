/**
 * Checks the BORME import against the live BOE site without touching the database: reads one day's index,
 * parses the first provincial PDFs and prints what it found, the warnings, and a few sample entries.
 *
 *   npm run borme:probe -- [--day 2026-09-29] [--pdfs 3]
 */
import { fetchSectionA } from "../src/lib/borme/fetch.ts";
import { toActRows, type ActRow } from "../src/lib/borme/rows.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const day = arg("day") ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const all: ActRow[] = [];
const r = await fetchSectionA(day, { limit: Number(arg("pdfs") ?? 3), onPdf: async (p, entries) => void all.push(...toActRows(entries, { publishedOn: day, bormeId: p.id, province: p.province })) });
console.log(`${day}: ${r.status} · ${r.pdfs} PDF · ${r.entries} anuncios · ${r.acts} actos · ${r.warnings.length} avisos`);
const byType = new Map<string, number>();
for (const a of all) byType.set(a.act_type, (byType.get(a.act_type) ?? 0) + 1);
console.log("Actos por tipo:", Object.fromEntries([...byType].sort((a, b) => b[1] - a[1])));
console.log(`Sin hoja registral: ${all.filter((a) => !a.registry_sheet).length} · sin fecha de inscripción: ${all.filter((a) => !a.registered_on).length}`);
for (const w of r.warnings.slice(0, 15)) console.log(`AVISO ${w.pdf} ${w.code}: ${w.message}`);
const labelsOther = [...new Set(all.filter((a) => a.act_type === "other").map((a) => a.act_label))];
if (labelsOther.length) console.log("Etiquetas tipo 'other':", labelsOther);
for (const a of all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 8)) === 0).slice(0, 8)) {
  console.log(`\n${a.entry_number} · ${a.company_name} [${a.registry_sheet ?? "sin hoja"}] ${a.registered_on ?? ""}\n  ${a.act_label}: ${a.act_text.slice(0, 160)}\n  ${JSON.stringify(a.details)}`);
}
