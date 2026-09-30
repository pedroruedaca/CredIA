import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { caseViewSample as sample } from "../__fixtures__/case-view-sample.ts";
import { packageJson, packageXlsx, exportFilename } from "./export.ts";
import { buildPackage } from "./package.ts";
import { packagePdf } from "./pdf.tsx";

describe("exports", () => {
  const pkg = buildPackage(sample);
  const at = "2026-09-29T10:00:00.000Z";

  it("JSON carries figures with source_refs, checks with reviews, and the disclaimer", () => {
    const j = packageJson(sample, pkg, at);
    expect(j.disclaimer).toMatch(/no puntúa ni recomienda/);
    const cash = j.balance_sheet.assets.find((r) => r.key === "cash")!;
    expect(cash.accounts.closed_fy.every((a) => a.source_ref.length > 0)).toBe(true);
    const c = j.checks.find((x) => x.key === "cirbe_vs_books_debt")!;
    expect(c.review?.status).toBe("reviewed");
    expect(c.source_refs.length).toBeGreaterThan(0);
    expect(JSON.stringify(j)).not.toMatch(/\b(score|scoring|rating|aprobad[oa]|recomendamos)\b/i);
    expect(exportFilename(sample, "json", "2026-09-29")).toBe("credia-Distribuciones-Ejemplo-S-L-2026-09-29.json");
  });

  it("Excel has the five sheets and a traceability row per account", async () => {
    const buf = await packageXlsx(sample, pkg, at);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Balance", "PyG", "KPIs", "Alertas", "Trazabilidad"]);
    expect(wb.getWorksheet("Trazabilidad")!.rowCount).toBeGreaterThan(10);
  });

  it("PDF includes the Registro Mercantil section with officers and acts", async () => {
    const { BORME_A_VALENCIA_TEXT } = await import("../__fixtures__/borme-a-valencia.ts");
    const { parseSectionA } = await import("../borme/parse.ts");
    const { toActRows } = await import("../borme/rows.ts");
    const { buildProfile } = await import("../borme/profile.ts");
    const { pdfText } = await import("../borme/fetch.ts");
    const rows = toActRows(parseSectionA(BORME_A_VALENCIA_TEXT).data, { publishedOn: "2026-09-29", bormeId: "BORME-A-2026-185-46", province: "VALENCIA", pdfUrl: "x" });
    const withRegistry = {
      ...sample,
      registry: { coverage: { from: "2023-10-02", to: "2026-09-29" }, match: { status: "confirmed" as const, sheet: "V-123456", decidedAt: at }, candidates: [], profile: buildProfile(rows.filter((r) => r.registry_sheet === "V-123456")) },
    };
    const p = buildPackage(withRegistry);
    expect(p.sources.map((x) => x.label)).toContain("BORME · hoja V-123456");
    const text = await pdfText(new Uint8Array(await packagePdf(withRegistry, p, at)));
    expect(text).toContain("Registro Mercantil · BORME revisado desde 2 oct 2023");
    expect(text).toContain("GARCIA RUIZ MARIA");
    expect(text).toContain("Ampliación de capital");
    expect(text).toContain("60.000 €");
    // Without a confirmed company the section says why it is empty.
    expect(await pdfText(new Uint8Array(await packagePdf(sample, pkg, at)))).toContain("El BORME aún no se ha importado.");
  }, 30_000);

  it("the informe de solvencia is in the PDF (provider figures attributed) and the JSON; only there may a rating appear", async () => {
    const { solvencyWireSample } = await import("../__fixtures__/solvency-report.ts");
    const { assessExtraction } = await import("../extract/assess.ts");
    const { pdfText } = await import("../borme/fetch.ts");
    const report = (assessExtraction("solvency_report", solvencyWireSample, { fileName: "x.pdf", caseCif: "B12345674", companyName: "X", lenderName: "L", expectedFiscalYear: null }).canonical as { data: import("../schema/canonical.ts").SolvencyReport }).data;
    const withReport = { ...sample, solvency: { docId: "s1", fileName: "experian.pdf", uploadedBy: "lender" as const, status: "parsed", attention: null, report } };
    const p = buildPackage(withReport);
    const text = await pdfText(new Uint8Array(await packagePdf(withReport, p, at)));
    expect(text).toContain("Informe de solvencia · Experian · Informe de empresa");
    expect(text).toContain("Rating Experian");
    expect(text).toContain("Banco Ejemplo SA");
    expect(text).toContain("credIA no los calcula");
    const j = packageJson(withReport, p, at);
    expect(j.solvency_report).toMatchObject({ provider: "experian", rating: { value: "7" }, uploaded_by: "lender", source_ref: "doc:s1" });
    const { solvency_report: _provider, ...rest } = j;
    expect(JSON.stringify(rest)).not.toMatch(/\b(score|scoring|rating|aprobad[oa]|recomendamos)\b/i);
  }, 30_000);

  it("PDF renders", async () => {
    const buf = await packagePdf(sample, pkg, at);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
