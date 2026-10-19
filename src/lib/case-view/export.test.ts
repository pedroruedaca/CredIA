import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { caseViewSample as sample } from "../__fixtures__/case-view-sample.ts";
import { packageJson, packageXlsx, exportFilename } from "./export.ts";
import { buildPackage } from "./package.ts";
import { packagePdf } from "./pdf.tsx";
import { CHECK_PASS_LABEL } from "../../content/case-view.es.ts";

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
    // The analyst's cost of sales, with every account it takes and its source.
    expect(j.cost_of_sales).toMatchObject({ criterion: "analyst", preset: "services" });
    expect(j.cost_of_sales!.periods.closed_fy.total).toBe(785_000);
    expect(j.cost_of_sales!.periods.closed_fy.items.every((i) => i.source_ref.length > 0)).toBe(true);
    expect(j.kpis.closed_fy.find((k) => k.key === "adjustedGrossMargin")).toMatchObject({ value: 21.5, label: "Margen bruto ajustado (criterio del analista)" });
    // Bank KPIs travel with their window and the files behind them.
    expect(j.bank_kpis?.sources).toEqual(["doc:n1"]);
    expect(j.bank_kpis?.period).toMatchObject({ start: "2026-01-01", end: "2026-03-31" });
    expect(j.bank_kpis?.kpis.find((k) => k.key === "daysCashOnHand")?.label).toBe("Días de caja");
  });

  it("Excel has the five sheets and a traceability row per account", async () => {
    const buf = await packageXlsx(sample, pkg, at);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Balance", "PyG", "KPIs", "Alertas", "Trazabilidad"]);
    expect(wb.getWorksheet("Trazabilidad")!.rowCount).toBeGreaterThan(10);
    const rows = wb.getWorksheet("KPIs")!.getSheetValues().filter(Boolean) as unknown[][];
    expect(rows.filter((r) => r[2] === "Bancos").length).toBe(16);
  });

  it("PDF includes the Registro Mercantil section with officers and acts", async () => {
    const { BORME_A_VALENCIA_TEXT } = await import("../__fixtures__/borme-a-valencia.ts");
    const { parseSectionA } = await import("../borme/parse.ts");
    const { toActRows } = await import("../borme/rows.ts");
    const { buildProfile } = await import("../borme/profile.ts");
    const { pdfText } = await import("../borme/fetch.ts");
    const rows = toActRows(parseSectionA(BORME_A_VALENCIA_TEXT).data, { publishedOn: "2026-09-29", bormeId: "BORME-A-2026-185-46", province: "VALENCIA" });
    const acts = rows.filter((r) => r.registry_sheet === "V-123456");
    const withRegistry = {
      ...sample,
      registry: { coverage: { from: "2023-10-02", to: "2026-09-29" }, match: { status: "confirmed" as const, sheet: "V-123456", decidedAt: at }, candidates: [], profile: buildProfile(acts), acts, fetch: null },
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

  it("PDF follows the case's layout: its order, and removed modules left out", async () => {
    const { pdfText } = await import("../borme/fetch.ts");
    const layout = { version: 1 as const, modules: [{ id: "sources" as const, width: "full" as const }, { id: "review" as const, width: "full" as const }] };
    const text = await pdfText(new Uint8Array(await packagePdf(sample, pkg, at, layout)));
    expect(text.indexOf("Fuentes")).toBeGreaterThan(-1);
    expect(text.indexOf("Fuentes")).toBeLessThan(text.indexOf("Para revisar"));
    expect(text).not.toContain("Registro Mercantil");
    expect(text).toContain("Estados financieros"); // appendix, always
    const full = await pdfText(new Uint8Array(await packagePdf(sample, pkg, at)));
    expect(full).toContain("Registro Mercantil");
    expect(full.indexOf("Para revisar")).toBeLessThan(full.indexOf("Fuentes"));
  }, 30_000);

  it("PDF applies module settings: the KPI tiles chosen, passed checks hidden", async () => {
    const { pdfText } = await import("../borme/fetch.ts");
    const layout = {
      version: 1 as const,
      modules: [
        { id: "kpis" as const, width: "full" as const, settings: { tiles: ["revenue" as const, "dsoDpo" as const, "daysCashOnHand" as const, "debtServiceBurden" as const] } },
        { id: "review" as const, width: "full" as const, settings: { showPassed: false } },
      ],
    };
    const text = await pdfText(new Uint8Array(await packagePdf(sample, pkg, at, layout)));
    expect(text).toContain("Cifra de negocios");
    expect(text).toContain("DSO / DPO");
    // Bank tiles, with their unit.
    expect(text).toContain("Días de caja");
    expect(text).toMatch(/Carga de deuda[\s\S]*\d %/);
    expect(text).not.toContain("DSCR");
    // A second «Indicadores» prints its own tiles; a half-width one, three at most.
    const two = { version: 1 as const, modules: [...layout.modules, { id: "kpis" as const, key: "kpis-2", width: "half" as const, settings: { tiles: ["dscr" as const, "overdraftDays" as const, "minBalance" as const, "netBurn" as const] } }] };
    const text2 = await pdfText(new Uint8Array(await packagePdf(sample, pkg, at, two)));
    expect(text2).toContain("Días de caja");
    expect(text2).toContain("DSCR");
    expect(text2).toContain("Saldo mínimo");
    expect(text2).not.toContain("Consumo neto");
    for (const v of pkg.passed) expect(text).not.toContain(CHECK_PASS_LABEL[v.key] ?? v.name);
    expect(pkg.passed.length).toBeGreaterThan(0);
  }, 30_000);

  it("PDF states the summary figures chosen for «Resumen»", async () => {
    const { pdfText } = await import("../borme/fetch.ts");
    const { summaryText } = await import("../summary.ts");
    const { summaryView } = await import("./package.ts");
    const flat = (t: string) => t.replace(/\s+/g, " ");
    const pdf = async (facts?: ("revenue" | "netDebt" | "equity")[]) =>
      flat(await pdfText(new Uint8Array(await packagePdf(sample, pkg, at, { version: 1, modules: [{ id: "summary", width: "full", ...(facts ? { settings: { facts } } : {}) }, { id: "review", width: "full" }] }))));
    const chosen = summaryText(summaryView(sample, ["revenue", "netDebt", "equity"]));
    expect(chosen).toMatch(/patrimonio neto/);
    const withChoice = await pdf(["revenue", "netDebt", "equity"]);
    expect(withChoice).toContain(flat(chosen));
    expect(withChoice).not.toContain("EBITDA de");
    expect(await pdf()).toContain(flat(summaryText(pkg.summary)));
  }, 30_000);

  it("the analyst's conclusions travel with their sources in every export, whatever the layout", async () => {
    const withConclusions = {
      ...sample,
      conclusions: [
        {
          id: "0a0a0a0a-1111-4222-8333-944455556666",
          text: "La deuda CIRBE es de **245.000 €** [[ref:raaaaaaaa]], 85.000 € más que en libros [[ref:rbbbbbbbb]].",
          citations: [
            { h: "raaaaaaaa", label: "CIRBE 2025-12-31 · total dispuesto", sourceRef: "doc:c1:page:2", href: null },
            { h: "rbbbbbbbb", label: "Verificación · Deuda CIRBE frente a libros", sourceRef: null, href: null },
          ],
          question: "¿Cuánta deuda declara la CIRBE?",
          createdBy: null,
          createdAt: "2026-10-01T10:00:00Z",
        },
      ],
    };
    const p = buildPackage(withConclusions);
    const j = packageJson(withConclusions, p, at);
    expect(j.analyst_conclusions!.items[0]).toMatchObject({
      text: "La deuda CIRBE es de 245.000 € [1], 85.000 € más que en libros [2].",
      question: "¿Cuánta deuda declara la CIRBE?",
      sources: [{ n: 1, label: "CIRBE 2025-12-31 · total dispuesto", source_ref: "doc:c1:page:2" }, { n: 2, source_ref: null }],
    });
    expect(packageJson(sample, pkg, at).analyst_conclusions).toBeNull();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await packageXlsx(withConclusions, p, at)) as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Conclusiones")!.getCell("A5").value).toBe("La deuda CIRBE es de 245.000 € [1], 85.000 € más que en libros [2].");

    const { pdfText } = await import("../borme/fetch.ts");
    // A layout with only «Para revisar» still prints the conclusions.
    const text = await pdfText(new Uint8Array(await packagePdf(withConclusions, p, at, { version: 1, modules: [{ id: "review", width: "full" }] })));
    expect(text).toContain("Conclusiones del analista");
    expect(text).toContain("CIRBE 2025-12-31 · total dispuesto");
    expect(await pdfText(new Uint8Array(await packagePdf(sample, pkg, at)))).not.toContain("Conclusiones del analista");
  }, 30_000);

  it("a threshold from a parameter says which, with its value for the case and source_ref, in every export", async () => {
    const P = "11111111-1111-4111-8111-111111111111";
    const withParam = {
      ...sample,
      policy: { id: "pol-2", name: "Circulante", description: null, criteria: [{ metric: "dscr" as const, op: "gte" as const, period: "base" as const, parameter: { id: P, factor: 1 } }] },
      parameters: [{ id: P, name: "DSCR mínimo", unit: "x" as const, scope: "fixed" as const, value: 1.25, sourceRef: `param:${P}` }],
    };
    const p = buildPackage(withParam);
    const j = packageJson(withParam, p, at);
    expect(j.credit_policy!.criteria[0]).toMatchObject({ threshold: 1.25, status: "met", threshold_from: { name: "DSCR mínimo", scope: "fixed", factor: 1, value: 1.25, source_ref: `param:${P}` } });
    expect(j.policy_parameters).toEqual([{ id: P, name: "DSCR mínimo", unit: "x", scope: "fixed", value: 1.25, source_ref: `param:${P}` }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await packageXlsx(withParam, p, at)) as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Política")!.getCell("B5").value).toBe("≥ DSCR mínimo (1,25x)");
    const { pdfText } = await import("../borme/fetch.ts");
    const text = await pdfText(new Uint8Array(await packagePdf(withParam, p, at, { version: 1, modules: [{ id: "kpis", width: "full" }] })));
    expect(text).toContain("DSCR mínimo");
  });

  it("the applied credit policy travels in the JSON, an Excel sheet and the PDF, above the modules", async () => {
    const withPolicy = {
      ...sample,
      policy: {
        id: "pol-1",
        name: "Circulante pyme",
        description: null,
        criteria: [
          { metric: "dscr" as const, op: "gte" as const, threshold: 1.25, period: "base" as const },
          { metric: "debtToEquity" as const, op: "lte" as const, threshold: 0.5, period: "closed" as const },
          { metric: "minBalance" as const, op: "gte" as const, threshold: 10_000, period: "base" as const },
        ],
      },
    };
    const p = buildPackage(withPolicy);
    const j = packageJson(withPolicy, p, at);
    expect(j.credit_policy).toMatchObject({ name: "Circulante pyme", outcome: "outside", outcome_label: "Fuera de la política", counts: { met: 2, not_met: 1, no_data: 0 } });
    expect(j.credit_policy!.statement).toMatch(/no permitirían financiar: 1 criterio no se cumple/);
    expect(j.credit_policy!.criteria.map((c) => [c.metric, c.value, c.status, c.kpi_ref])).toEqual([
      ["dscr", 1.59, "met", "kpis.closed_fy.dscr"],
      ["debtToEquity", 0.72, "not_met", "kpis.closed_fy.debtToEquity"],
      ["minBalance", 22_000, "met", "bank_kpis.minBalance"],
    ]);
    expect(packageJson(sample, pkg, at).credit_policy).toBeNull();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await packageXlsx(withPolicy, p, at)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Política")!;
    expect(ws.getCell("A1").value).toBe("Política «Circulante pyme» · Fuera de la política");
    expect([ws.getCell("A5").value, ws.getCell("B5").value, ws.getCell("C5").value, ws.getCell("F5").value]).toEqual(["DSCR", "≥ 1,25x", 1.59, "Cumple"]);

    const { pdfText } = await import("../borme/fetch.ts");
    const text = await pdfText(new Uint8Array(await packagePdf(withPolicy, p, at, { version: 1, modules: [{ id: "kpis", width: "full" }, { id: "review", width: "full" }] })));
    expect(text).toContain("Fuera de la política");
    expect(text.indexOf("Circulante pyme")).toBeLessThan(text.indexOf("DSCR"));
    expect(text.indexOf("Circulante pyme")).toBeLessThan(text.indexOf("Para revisar"));
    expect(text).toContain("≤ 0,5x");
    // No policy applied: nothing about policies in the PDF, nor an Excel sheet.
    const none = await pdfText(new Uint8Array(await packagePdf(sample, pkg, at)));
    expect(none).not.toMatch(/Política|Informativo\. Compara/);
    const wb0 = new ExcelJS.Workbook();
    await wb0.xlsx.load((await packageXlsx(sample, pkg, at)) as unknown as ArrayBuffer);
    expect(wb0.getWorksheet("Política")).toBeUndefined();
    // Without «Indicadores» in the layout it still prints.
    expect(await pdfText(new Uint8Array(await packagePdf(withPolicy, p, at, { version: 1, modules: [{ id: "review", width: "full" }] })))).toContain("Circulante pyme");
  }, 30_000);

  it("PDF renders", async () => {
    const buf = await packagePdf(sample, pkg, at);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
