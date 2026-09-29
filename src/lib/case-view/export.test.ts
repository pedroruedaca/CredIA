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

  it("PDF renders", async () => {
    const buf = await packagePdf(sample, pkg, at);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
