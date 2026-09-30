import { createElement as h } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { BORME_A_VALENCIA_TEXT } from "../__fixtures__/borme-a-valencia.ts";
import { fetchSectionA, pdfText } from "./fetch.ts";

/** A PDF whose lines are the fixture's lines, split in two pages where the fixture has its page break. */
async function fixturePdf(): Promise<Uint8Array> {
  const pages = BORME_A_VALENCIA_TEXT.split(/(?<=Verificable en https:\/\/www\.boe\.es\n)/).filter((p) => p.trim());
  const doc = h(
    Document,
    null,
    pages.map((p, i) => h(Page, { key: i, size: "A4", style: { padding: 30, fontSize: 8 } }, p.trim().split("\n").map((l, j) => h(Text, { key: j }, l)))),
  );
  return new Uint8Array(await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]));
}

const INDEX = { data: { sumario: { diario: [{ seccion: [{ codigo: "A", item: [{ identificador: "BORME-A-2026-185-46", titulo: "VALENCIA", url_pdf: { texto: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf" } }] }] }] } } };

describe("fetchSectionA", () => {
  it("reads the index, extracts the PDF text and parses it into rows", async () => {
    const pdf = await fixturePdf();
    expect((await pdfText(pdf)).split("\n")).toContain("412346 - TALLERES DEMO LEVANTE SL.");
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("/datosabiertos/")) return new Response(JSON.stringify(INDEX), { status: 200 });
      return new Response(new Blob([pdf.slice()]), { status: 200 });
    }) as unknown as typeof fetch;
    const stored: string[] = [];
    const r = await fetchSectionA("2026-09-29", { fetchImpl: fake, onPdf: async (id, rows) => void stored.push(`${id}:${rows.length}`) });
    expect(calls).toEqual(["https://www.boe.es/datosabiertos/api/borme/sumario/20260929", "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf"]);
    expect(r).toMatchObject({ status: "ingested", pdfs: 1, entries: 6, acts: 11, warnings: [] });
    expect(stored).toEqual(["BORME-A-2026-185-46:11"]);
  }, 30_000);

  it("treats a missing index as a day without BORME and retries server errors", async () => {
    let n = 0;
    const flaky = (async () => (++n === 1 ? new Response("", { status: 503, headers: { "retry-after": "0" } }) : new Response("", { status: 404 }))) as unknown as typeof fetch;
    expect(await fetchSectionA("2026-10-03", { fetchImpl: flaky })).toMatchObject({ status: "no_issue", pdfs: 0 });
    expect(n).toBe(2);
  }, 10_000);
});
