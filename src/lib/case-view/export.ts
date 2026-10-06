/**
 * Credit data package exports. JSON (machine-readable, every figure with its source_ref) and Excel
 * (Balance, PyG, KPIs, Alertas, Trazabilidad). No scores, no recommendations; the disclaimer travels with the data.
 */
import ExcelJS from "exceljs";
import { CHECK_NAME, DISCLAIMER, KPI_LABEL, REVIEW_LABEL, SEVERITY_LABEL, VALUE_LABEL } from "../../content/case-view.es.ts";
import { checkSlugs } from "./evidence.ts";
import type { CaseViewData } from "./load.ts";
import type { CasePackage } from "./package.ts";
import { describeSource } from "./present.ts";
import { statementTables, type TableRow } from "./tables.ts";

export function exportFilename(d: CaseViewData, ext: string, today: string): string {
  const name = d.kase.companyName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || d.kase.cif;
  return `credia-${name}-${today}.${ext}`;
}

const unitLabel = (u: string) => (u === "EUR" ? "€" : u === "days" ? "días" : u === "count" ? "n.º" : u);

const periodOf = (d: CaseViewData) => [d.statements.closed, d.statements.ytd].filter((s) => s !== null);

export function packageJson(d: CaseViewData, pkg: CasePackage, generatedAt: string) {
  const statements = periodOf(d);
  const tables = statementTables(statements, false);
  const lines = (rows: TableRow[]) =>
    rows.map((r) => ({
      key: r.key,
      label: r.label.trim(),
      values: Object.fromEntries(statements.map((s, i) => [s.period.kind, r.values[i]])),
      accounts: Object.fromEntries(statements.map((s, i) => [s.period.kind, r.accounts[i].map((c) => ({ account: c.account, amount: c.amount, source_ref: c.sourceRef }))])),
    }));
  const evidenceBySlug = new Map(checkSlugs(d.checks).map((c) => [c.slug, c.evidence]));
  return {
    format: "credia.package.v1",
    generated_at: generatedAt,
    disclaimer: DISCLAIMER,
    case: {
      id: d.kase.id,
      company: d.kase.companyName,
      cif: d.kase.cif,
      product: d.kase.product,
      requested_amount: d.kase.amount,
      term_months: d.kase.termMonths,
      fiscal_year_end: d.kase.fiscalYearEnd,
      status: d.kase.status,
    },
    solvency_report: d.solvency?.report
      ? {
          note: "Rating, probabilidad de impago y límite son datos del proveedor tal como figuran en su informe; credIA no los calcula ni los usa en sus verificaciones.",
          uploaded_by: d.solvency.uploadedBy,
          source_ref: `doc:${d.solvency.docId}`,
          ...d.solvency.report,
        }
      : null,
    registry: d.registry.profile
      ? {
          source: "BORME, sección A",
          covered_from: d.registry.coverage?.from ?? null,
          registry_sheet: d.registry.profile.sheet,
          name: d.registry.profile.name,
          former_names: d.registry.profile.formerNames,
          constituted_on: d.registry.profile.constitutedOn,
          capital: d.registry.profile.capital,
          officers: d.registry.profile.officers,
          acts: d.registry.profile.timeline.map((t) => ({ date: t.date, type: t.type, label: t.label, text: t.text, source_ref: t.source })),
        }
      : null,
    periods: statements.map((s) => ({ kind: s.period.kind, start: s.period.start, end: s.period.end, months: s.months, pnl_available: s.pnlAvailable, scope: s.scope ?? "full", source: s.period.kind === "closed_fy" ? d.statements.closedSource : d.statements.ytdSource })),
    balance_sheet: { assets: lines(tables.assets), equity_and_liabilities: lines(tables.liabilities) },
    income_statement: lines(tables.pnl),
    kpis: Object.fromEntries(
      statements.map((s) => [s.period.kind, (s.period.kind === "closed_fy" ? d.kpis.closed : d.kpis.ytd).map((k) => ({ key: k.key, label: KPI_LABEL[k.key] ?? k.key, value: k.value, unit: k.unit, formula: k.formula, inputs: k.inputs, note: k.note ?? null }))]),
    ),
    bank_kpis: d.bank
      ? {
          period: d.bank.period,
          accounts: d.bank.accounts,
          sources: d.bank.sources,
          coverage_note: d.bank.coverageNote,
          kpis: d.bank.kpis.map((k) => ({ key: k.key, label: KPI_LABEL[k.key] ?? k.key, value: k.value, unit: k.unit, formula: k.formula, inputs: k.inputs, note: k.note ?? null })),
        }
      : null,
    checks: [...pkg.open.map((v) => ({ v, review: v.review })), ...pkg.passed.map((v) => ({ v, review: null }))].map(({ v, review }) => ({
      id: v.slug,
      key: v.key,
      name: v.name,
      status: v.status,
      severity: v.severity,
      message: v.message,
      rule: v.rule,
      values: (evidenceBySlug.get(v.slug) as { values?: unknown } | undefined)?.values ?? {},
      source_refs: v.sources,
      review: review ? { status: review.status, note: review.note, at: review.at } : null,
    })),
    cirbe: d.cirbe ? { as_of: d.cirbe.asOf, positions: d.cirbe.positions.map((p) => ({ ...p, source_ref: d.cirbeDocId ? `doc:${d.cirbeDocId}:page:${p.page}` : null })) } : null,
    documents: d.documents.map((doc) => ({ id: doc.id, kind: doc.kind, filename: doc.original_filename, status: doc.status, uploaded_at: doc.uploaded_at, issued_on: doc.issued_on ?? null })),
    holded: d.holded ? { status: d.holded.status, last_sync_at: d.holded.lastSyncAt, entries: d.holded.entries } : null,
  };
}

// ------------------------------------------------------------------------------------------------ Excel

const INK = "FF111315";
const MUTED = "FF6B6F76";
const SOFT = "FFF6F6F3";
const EUR_FMT = '#,##0 "€";-#,##0 "€"';

function header(ws: ExcelJS.Worksheet, cells: string[]) {
  const row = ws.addRow(cells);
  row.font = { bold: true, color: { argb: MUTED }, size: 10 };
  row.border = { bottom: { style: "thin", color: { argb: "FFECEBE6" } } };
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string) {
  ws.addRow([text]).font = { bold: true, size: 14, color: { argb: INK } };
  ws.addRow([sub]).font = { size: 10, color: { argb: MUTED } };
  ws.addRow([]);
}

export async function packageXlsx(d: CaseViewData, pkg: CasePackage, generatedAt: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "credIA";
  wb.created = new Date(generatedAt);
  const statements = periodOf(d);
  const tables = statementTables(statements, false);
  const cols = statements.map((s) => `${s.period.kind === "closed_fy" ? `Cierre ${s.period.end}` : `YTD ${s.period.end}`}${s.scope === "revenue" ? " · IVA (solo ventas)" : ""}`);
  const sub = `${d.kase.companyName} · CIF ${d.kase.cif} · generado ${generatedAt.slice(0, 10)} · ${DISCLAIMER}`;

  const statementSheet = (name: string, sections: [string, TableRow[]][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4 }] });
    title(ws, name === "Balance" ? "Balance" : "Cuenta de resultados", sub);
    header(ws, ["Línea", ...cols]);
    for (const [section, rows] of sections) {
      if (section) ws.addRow([section]).font = { bold: true, color: { argb: MUTED } };
      for (const r of rows) {
        const row = ws.addRow([r.label.trim(), ...r.values]);
        for (let i = 2; i <= cols.length + 1; i++) row.getCell(i).numFmt = EUR_FMT;
        if (r.kind !== "line" && r.kind !== "memo") {
          row.font = { bold: true };
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
        }
        if (r.kind === "memo") row.font = { italic: true, color: { argb: MUTED } };
      }
    }
    ws.getColumn(1).width = 44;
    for (let i = 2; i <= cols.length + 1; i++) ws.getColumn(i).width = 18;
  };
  statementSheet("Balance", [["Activo", tables.assets], ["Patrimonio neto y pasivo", tables.liabilities]]);
  statementSheet("PyG", [["", tables.pnl]]);

  const kpis = wb.addWorksheet("KPIs");
  title(kpis, "Indicadores", sub);
  header(kpis, ["Indicador", "Periodo", "Valor", "Unidad", "Fórmula", "Datos", "Nota"]);
  for (const s of statements) {
    for (const k of s.period.kind === "closed_fy" ? d.kpis.closed : d.kpis.ytd) {
      const inputs = Object.entries(k.inputs).map(([key, v]) => `${VALUE_LABEL[key] ?? key}: ${v}`).join("; ");
      kpis.addRow([KPI_LABEL[k.key] ?? k.key, s.period.kind === "closed_fy" ? "Cierre" : "YTD", k.value, unitLabel(k.unit), k.formula, inputs, k.note ?? ""]);
    }
  }
  // KPIs read from the bank movements (Norma 43), over their own window.
  for (const k of d.bank?.kpis ?? []) {
    const inputs = Object.entries(k.inputs).map(([key, v]) => `${VALUE_LABEL[key] ?? key}: ${v}`).join("; ");
    kpis.addRow([KPI_LABEL[k.key] ?? k.key, "Bancos", k.value, unitLabel(k.unit), k.formula, inputs, k.note ?? ""]);
  }
  [26, 10, 14, 8, 60, 60, 50].forEach((w, i) => (kpis.getColumn(i + 1).width = w));

  const alerts = wb.addWorksheet("Alertas");
  title(alerts, "Verificaciones", sub);
  header(alerts, ["Verificación", "Estado", "Severidad", "Mensaje", "Regla", "Revisión", "Nota interna"]);
  for (const v of pkg.open) {
    alerts.addRow([v.name, "Abierta", SEVERITY_LABEL[v.severity], v.message, v.rule ?? "", v.review ? REVIEW_LABEL[v.review.status] : "", v.review?.note ?? ""]);
  }
  for (const v of pkg.passed) alerts.addRow([v.name, "Correcta", "", v.message, v.rule ?? "", "", ""]);
  [34, 10, 10, 80, 50, 16, 40].forEach((w, i) => (alerts.getColumn(i + 1).width = w));

  const trace = wb.addWorksheet("Trazabilidad");
  title(trace, "Trazabilidad", `Cada importe con su origen (source_ref). ${sub}`);
  header(trace, ["Periodo", "Línea", "Cuenta", "Importe", "Origen", "source_ref"]);
  statements.forEach((s, col) => {
    for (const r of [...tables.assets, ...tables.liabilities, ...tables.pnl]) {
      for (const c of r.accounts[col] ?? []) {
        const row = trace.addRow([s.period.kind === "closed_fy" ? "Cierre" : "YTD", r.label.trim(), c.account, c.amount, describeSource(c.sourceRef, d.documents).label, c.sourceRef]);
        row.getCell(4).numFmt = EUR_FMT;
      }
    }
  });
  for (const v of [...pkg.open, ...pkg.passed]) {
    for (const ref of v.sources) trace.addRow(["Verificación", CHECK_NAME[v.key] ?? v.key, "", null, describeSource(ref, d.documents).label, ref]);
  }
  [12, 36, 14, 16, 36, 70].forEach((w, i) => (trace.getColumn(i + 1).width = w));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
