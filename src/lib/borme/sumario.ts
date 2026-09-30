/**
 * BOE open-data index ("sumario") of one BORME issue: which Section A provincial PDFs were published that day.
 *   GET https://www.boe.es/datosabiertos/api/borme/sumario/YYYYMMDD   (Accept: application/json; 404 = no issue)
 * The response is read by walking it for items whose identifier is a Section A PDF ("BORME-A-<year>-<issue>-<n>"),
 * so a change in nesting does not break it. Pure.
 */

export const SUMARIO_URL = (date: string) => `https://www.boe.es/datosabiertos/api/borme/sumario/${date.replace(/-/g, "")}`;

/** Where BOE serves a Section A PDF: https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf */
export const pdfUrl = (date: string, bormeId: string) => `https://www.boe.es/borme/dias/${date.replace(/-/g, "/")}/pdfs/${bormeId}.pdf`;

export interface SectionAPdf {
  id: string;
  province: string;
  url: string;
}

const ID = /^BORME-A-\d{4}-\d+-\d+$/;

function urlOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["texto", "#text", "url", "_"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return null;
}

/** Section A PDFs listed in a sumario response, once each, in published order. */
export function sectionAPdfs(json: unknown, date: string): SectionAPdf[] {
  const out = new Map<string, SectionAPdf>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const id = typeof o.identificador === "string" ? o.identificador : null;
    if (id && ID.test(id) && !out.has(id)) {
      const url = urlOf(o.url_pdf);
      out.set(id, {
        id,
        province: typeof o.titulo === "string" ? o.titulo.trim() : "",
        url: url && /^https:\/\/www\.boe\.es\//.test(url) ? url : pdfUrl(date, id),
      });
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return [...out.values()];
}
