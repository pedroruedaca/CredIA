/**
 * Committee PDF in the v2 design language: Geist / Geist Mono, ink on white, soft fills instead of borders,
 * severity dots, proportional balance bars, and the disclaimer on every page. Server-only (reads fonts from disk).
 */
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { CHECK_PASS_LABEL, DISCLAIMER, REVIEW_LABEL } from "../../content/case-view.es.ts";
import { productLabel } from "../../content/products.es.ts";
import { caseRef, formatCompactEur, formatDate, formatEurWhole, formatFigure } from "../format.ts";
import type { BalanceSegment, SegmentTone } from "./balance.ts";
import type { CaseViewData } from "./load.ts";
import type { CasePackage } from "./package.ts";
import { statementTables, type TableRow } from "./tables.ts";

const FONT_DIR = path.join(process.cwd(), "src/lib/case-view/fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Geist",
    fonts: [
      { src: path.join(FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Geist-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Geist-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "GeistMono",
    fonts: [
      { src: path.join(FONT_DIR, "GeistMono-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "GeistMono-Medium.ttf"), fontWeight: 500 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const C = {
  ink: "#111315", ink2: "#4B4F56", muted: "#6B6F76", soft: "#F6F6F3", hairline: "#ECEBE6", track: "#F2F2EE",
  high: "#8E2A1B", highDot: "#C2412D", highBg: "#FBEAE6", warnDot: "#C98A1B", infoDot: "#2F6DB5", ok: "#1F6135", okBg: "#EAF4EE",
};
const TONE: Record<SegmentTone, string> = {
  "asset-1": "#D9E6E4", "asset-2": "#9DC2BE", "asset-3": "#0E5A61", "debt-1": "#E7B9AF", "debt-2": "#D98C7C", related: "#EFD9B5", other: "#E4E3DE",
};
const DOT = { high: C.highDot, warn: C.warnDot, info: C.infoDot } as const;

const s = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 9.5, color: C.ink, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.4 },
  mono: { fontFamily: "GeistMono" },
  muted: { color: C.muted },
  topline: { flexDirection: "row", fontSize: 8.5, color: C.muted, marginBottom: 14, gap: 8 },
  h1: { fontSize: 26, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.1 },
  request: { fontSize: 10.5, color: C.ink2, marginTop: 6 },
  summary: { fontSize: 13, color: C.ink2, marginTop: 18, lineHeight: 1.5 },
  kpis: { flexDirection: "row", marginTop: 22, gap: 6 },
  kpi: { flex: 1, gap: 3 },
  kpiValue: { fontFamily: "GeistMono", fontSize: 18, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.2 },
  h2: { fontSize: 11.5, fontWeight: 600, marginTop: 26, marginBottom: 8, letterSpacing: -0.2 },
  checkRow: { flexDirection: "row", gap: 9, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 3.5 },
  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8, fontSize: 8 },
  bar: { flexDirection: "row", height: 18, gap: 2 },
  tableRow: { flexDirection: "row", paddingVertical: 3.5, borderTopWidth: 0.5, borderTopColor: C.hairline },
  tableStrong: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, backgroundColor: C.soft, borderRadius: 5, fontWeight: 600, marginVertical: 1 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 90, fontSize: 7.5, color: C.muted },
  pageNo: { position: "absolute", bottom: 24, right: 44, width: 40, textAlign: "right", fontSize: 7.5, color: C.muted, fontFamily: "GeistMono" },
});

const eur = formatEurWhole;
const fig = (v: number | null, unit: "x" | "days") => (v === null ? "—" : unit === "x" ? `${formatFigure(v, "x", 2).number}x` : `${v}d`);

function Bars({ label, segments }: { label: string; segments: BalanceSegment[] }) {
  return (
    <View style={{ gap: 3, marginBottom: 8 }} wrap={false}>
      <Text style={[s.muted, { fontSize: 8 }]}>{label}</Text>
      <View style={s.bar}>
        {segments.map((x, i) => (
          <View key={x.id} style={{ width: `${x.pct}%`, backgroundColor: TONE[x.tone], borderRadius: 3, borderTopLeftRadius: i === 0 ? 6 : 3, borderBottomLeftRadius: i === 0 ? 6 : 3, borderTopRightRadius: i === segments.length - 1 ? 6 : 3, borderBottomRightRadius: i === segments.length - 1 ? 6 : 3 }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 2, fontSize: 7.5, color: C.ink2 }}>
        {segments.map((x) => (
          <Text key={x.id} style={{ width: `${x.pct}%` }}>{x.pct >= 7 ? `${x.pct >= 15 ? x.label : x.short} ${Math.round(x.value / 1000).toLocaleString("es-ES")}` : ""}</Text>
        ))}
      </View>
    </View>
  );
}

function Table({ title, rows, cols }: { title: string; rows: TableRow[]; cols: string[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", paddingBottom: 4 }} wrap={false}>
        <Text style={{ flex: 1, fontWeight: 600, fontSize: 10.5 }}>{title}</Text>
        {cols.map((c) => <Text key={c} style={[s.muted, { width: 90, textAlign: "right", fontSize: 8 }]}>{c}</Text>)}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={r.kind === "line" || r.kind === "memo" ? s.tableRow : s.tableStrong} wrap={false}>
          <Text style={[{ flex: 1 }, r.kind === "memo" ? { color: C.muted, paddingLeft: 10 } : {}]}>{r.label.trim()}</Text>
          {r.values.map((v, i) => <Text key={i} style={[s.mono, { width: 90, textAlign: "right" }, r.kind === "memo" ? s.muted : {}]}>{v === null ? "—" : eur(v)}</Text>)}
        </View>
      ))}
    </View>
  );
}

function CasePdf({ d, pkg, generatedAt }: { d: CaseViewData; pkg: CasePackage; generatedAt: string }) {
  const { kase } = d;
  const amount = kase.amount ? formatFigure(kase.amount, "EUR") : null;
  const request = [kase.product ? productLabel(kase.product) : null, amount ? `${amount.number} ${amount.unit}` : null, kase.termMonths ? `${kase.termMonths} meses` : null, `CIF ${kase.cif}`].filter(Boolean).join(" · ");
  const statements = [d.statements.closed, d.statements.ytd].filter((x) => x !== null);
  const cols = statements.map((x) => (x.period.kind === "closed_fy" ? `Cierre ${formatDate(x.period.end)}` : `YTD ${formatDate(x.period.end)}`));
  const t = statementTables(statements);

  return (
    <Document title={`${kase.companyName} · credIA`} author="credIA" subject="Paquete de datos de crédito" language="es">
      <Page size="A4" style={s.page}>
        <View style={s.topline} fixed>
          <Text style={{ fontWeight: 600, color: C.ink }}>credIA</Text>
          <Text style={s.mono}>{caseRef(kase.id)}</Text>
          <Text style={{ flexGrow: 1 }}>{d.kase.lenderName}</Text>
          <Text>Generado el {formatDate(generatedAt)}</Text>
        </View>

        <Text style={s.h1}>{kase.companyName}</Text>
        <Text style={s.request}>{request}</Text>

        {pkg.summary && (
          <Text style={s.summary}>
            {pkg.summary.map((seg, i) => (
              <Text key={i} style={seg.emphasis === "figure" ? { color: C.ink, fontWeight: 600 } : seg.emphasis === "discrepancy" ? { color: C.high, fontWeight: 600 } : {}}>{seg.text}</Text>
            ))}
          </Text>
        )}

        {pkg.tiles.length > 0 && (
          <View style={s.kpis} wrap={false}>
            {pkg.tiles.map((k) => (
              <View key={k.id} style={s.kpi}>
                <Text style={[s.muted, { fontSize: 8.5 }]}>{k.label}</Text>
                <Text style={s.kpiValue}>{k.id === "dsoDpo" ? `${k.value ?? "—"}/${k.secondary ?? "—"}d` : fig(k.value, k.unit === "days" ? "days" : "x")}</Text>
                {k.sub && <Text style={[s.muted, { fontSize: 7.5 }]}>{k.sub}</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={s.h2}>Para revisar · {pkg.open.length} {pkg.open.length === 1 ? "abierta" : "abiertas"}</Text>
        {pkg.open.length === 0 && <Text style={{ color: C.ink2 }}>No hay alertas abiertas.</Text>}
        {pkg.open.map((v) => (
          <View key={v.slug} style={s.checkRow} wrap={false}>
            <View style={[s.dot, { backgroundColor: DOT[v.severity] }]} />
            <View style={{ flex: 1, gap: 1.5 }}>
              <Text style={{ fontWeight: 500, fontSize: 10 }}>{v.message}</Text>
              <Text style={[s.muted, { fontSize: 8.5 }]}>{[v.name, v.evidenceLine].filter(Boolean).join(" · ")}</Text>
              {v.review && v.review.status !== "open" && (
                <Text style={[s.muted, { fontSize: 8.5 }]}>{REVIEW_LABEL[v.review.status]} el {formatDate(v.review.at)}{v.review.note ? ` · Nota: ${v.review.note}` : ""}</Text>
              )}
            </View>
          </View>
        ))}
        {pkg.passed.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {pkg.passed.map((v) => <Text key={v.slug} style={[s.pill, { backgroundColor: C.okBg, color: C.ok }]}>{CHECK_PASS_LABEL[v.key] ?? v.name}</Text>)}
          </View>
        )}

        {pkg.balance && pkg.balanceDate && (
          <View wrap={false}>
            <Text style={s.h2}>Balance a {formatDate(pkg.balanceDate)} · {formatCompactEur(pkg.balance.total)}</Text>
            <Bars label="Activo" segments={pkg.balance.top} />
            <Bars label="Patrimonio neto y pasivo" segments={pkg.balance.bottom} />
          </View>
        )}
        {pkg.pnl && pkg.pnlPeriod && (
          <View wrap={false}>
            <Text style={s.h2}>
              Cuenta de resultados {pkg.pnlPeriod.months === 12 && pkg.pnlPeriod.start.endsWith("-01-01") ? pkg.pnlPeriod.end.slice(0, 4) : `${formatDate(pkg.pnlPeriod.start)} – ${formatDate(pkg.pnlPeriod.end)}`} · {formatCompactEur(pkg.pnl.total)} de ingresos
            </Text>
            <Bars label="Ingresos" segments={pkg.pnl.top} />
            <Bars label="Gastos y resultado" segments={pkg.pnl.bottom} />
          </View>
        )}

        {statements.length > 0 && (
          <View break>
            <Text style={[s.h2, { marginTop: 0 }]}>Estados financieros</Text>
            <Table title="Activo" rows={t.assets} cols={cols} />
            <Table title="Patrimonio neto y pasivo" rows={t.liabilities} cols={cols} />
            {t.pnl.length > 0 && <Table title="Cuenta de resultados" rows={t.pnl} cols={cols} />}
            <Text style={[s.muted, { fontSize: 8 }]}>Agrupado por código PGC de 3 dígitos. YTD sin anualizar. El detalle por cuenta y su origen está en la exportación Excel (hoja Trazabilidad).</Text>
          </View>
        )}

        <Text style={s.h2}>Fuentes</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {pkg.sources.length === 0 && <Text style={s.muted}>Sin documentos.</Text>}
          {pkg.sources.map((x) => <Text key={x.label} style={[s.pill, { backgroundColor: C.soft }]}>{x.label}</Text>)}
        </View>

        <Text style={s.footer} fixed>{DISCLAIMER}</Text>
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function packagePdf(d: CaseViewData, pkg: CasePackage, generatedAt: string): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<CasePdf d={d} pkg={pkg} generatedAt={generatedAt} />);
}
