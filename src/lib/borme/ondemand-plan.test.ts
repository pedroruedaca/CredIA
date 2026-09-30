import { describe, expect, it } from "vitest";
import { planSheetFetch } from "./ondemand-plan.ts";
import { bormeIdOf, pdfParts } from "./rows.ts";

describe("planSheetFetch", () => {
  it("groups a company's announcements by provincial PDF and rebuilds each PDF's URL", () => {
    const r = planSheetFetch(
      [
        { published_on: "2026-09-29", seq: 46, entry_number: 412348 },
        { published_on: "2026-09-29", seq: 46, entry_number: 412346 },
        { published_on: "2024-03-04", seq: 3, entry_number: 1000 },
        { published_on: "2025-01-02", seq: 9, entry_number: 5 },
      ],
      [
        { published_on: "2026-09-29", issue: 185, seq: 46, province: "VALENCIA" },
        { published_on: "2024-03-04", issue: 44, seq: 3, province: "ALICANTE/ALACANT" },
      ],
    );
    expect(r.missing).toBe(1);
    expect(r.pdfs.map((p) => [p.bormeId, p.url, [...p.entries]])).toEqual([
      ["BORME-A-2024-44-03", "https://www.boe.es/borme/dias/2024/03/04/pdfs/BORME-A-2024-44-03.pdf", [1000]],
      ["BORME-A-2026-185-46", "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf", [412348, 412346]],
    ]);
  });
  it("round-trips PDF ids", () => {
    expect(pdfParts("BORME-A-2026-185-08")).toEqual({ year: 2026, issue: 185, seq: 8 });
    expect(bormeIdOf(2026, 185, 8)).toBe("BORME-A-2026-185-08");
  });
});
