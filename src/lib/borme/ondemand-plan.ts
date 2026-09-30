/** Which provincial PDFs to download to read one company's announcements, from the light index. Pure. */
import { bormeIdOf } from "./rows.ts";
import { pdfUrl } from "./sumario.ts";

export interface SheetPdf {
  publishedOn: string;
  bormeId: string;
  province: string;
  url: string;
  entries: Set<number>;
}

export function planSheetFetch(
  index: { published_on: string; seq: number; entry_number: number }[],
  pdfs: { published_on: string; issue: number; seq: number; province: string }[],
): { pdfs: SheetPdf[]; missing: number } {
  const meta = new Map(pdfs.map((p) => [`${p.published_on}#${p.seq}`, p]));
  const out = new Map<string, SheetPdf>();
  let missing = 0;
  for (const r of index) {
    const key = `${r.published_on}#${r.seq}`;
    const p = meta.get(key);
    if (!p) {
      missing++;
      continue;
    }
    let plan = out.get(key);
    if (!plan) {
      const bormeId = bormeIdOf(Number(p.published_on.slice(0, 4)), p.issue, p.seq);
      plan = { publishedOn: p.published_on, bormeId, province: p.province, url: pdfUrl(p.published_on, bormeId), entries: new Set() };
      out.set(key, plan);
    }
    plan.entries.add(r.entry_number);
  }
  return { pdfs: [...out.values()].sort((a, b) => a.publishedOn.localeCompare(b.publishedOn)), missing };
}
