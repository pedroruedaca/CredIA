/**
 * Network side of the BORME import, without the database: BOE index → Section A PDFs → text → parsed rows.
 * Shared by the importer (which stores the rows) and `npm run borme:probe` (which only prints them).
 * HTTP 429/5xx are retried with backoff; a 404 index means no BORME that day.
 */
import { extractText, getDocumentProxy } from "unpdf";
import type { Warning } from "../types.ts";
import { parseSectionA } from "./parse.ts";
import { toActRows, type ActRow } from "./rows.ts";
import { SUMARIO_URL, sectionAPdfs } from "./sumario.ts";

export interface DayImport {
  day: string;
  status: "ingested" | "no_issue" | "failed";
  pdfs: number;
  entries: number;
  acts: number;
  warnings: (Warning & { pdf?: string })[];
  error?: string;
  skipped?: boolean;
}

const UA = "credIA BORME importer";

async function get(url: string, accept: string, fetchImpl: typeof fetch, attempts = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetchImpl(url, { headers: { accept, "user-agent": UA } }).catch((e: Error) => e);
    const retry = res instanceof Error || res.status === 429 || res.status >= 500;
    if (!retry || i === attempts - 1) {
      if (res instanceof Error) throw res;
      return res;
    }
    const after = res instanceof Error ? null : Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, after && after > 0 ? Math.min(after, 60) * 1000 : 1000 * 2 ** i));
  }
}

/** Plain text of a PDF, one line per text line, pages joined. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  // pdf.js takes ownership of (detaches) the buffer it is given: pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Fetches and parses one day's Section A. `onPdf` receives each PDF's rows as soon as it is parsed. */
export async function fetchSectionA(
  day: string,
  opts: { fetchImpl?: typeof fetch; onPdf?: (pdfId: string, rows: ActRow[]) => Promise<void>; limit?: number } = {},
): Promise<DayImport> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const out: DayImport = { day, status: "ingested", pdfs: 0, entries: 0, acts: 0, warnings: [] };
  const index = await get(SUMARIO_URL(day), "application/json", fetchImpl);
  if (index.status === 404) return { ...out, status: "no_issue" };
  if (!index.ok) throw new Error(`Índice BORME ${day}: HTTP ${index.status}`);
  const pdfs = sectionAPdfs(await index.json(), day).slice(0, opts.limit);
  if (pdfs.length === 0) return { ...out, status: "no_issue" };

  for (const p of pdfs) {
    const res = await get(p.url, "application/pdf", fetchImpl);
    if (!res.ok) throw new Error(`${p.id}: HTTP ${res.status}`);
    const text = await pdfText(new Uint8Array(await res.arrayBuffer()));
    const parsed = parseSectionA(text, { province: p.province });
    const rows = toActRows(parsed.data, { publishedOn: day, bormeId: p.id, province: p.province, pdfUrl: p.url });
    if (opts.onPdf) await opts.onPdf(p.id, rows);
    out.pdfs++;
    out.entries += parsed.data.length;
    out.acts += rows.length;
    out.warnings.push(...parsed.warnings.map((w) => ({ ...w, pdf: p.id })));
  }
  return out;
}
