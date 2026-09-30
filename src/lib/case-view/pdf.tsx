/**
 * Committee PDF in the v2 design language: Geist / Geist Mono, ink on white, soft fills instead of borders,
 * severity dots, proportional balance bars, and the disclaimer on every page. Server-only (reads fonts from disk).
 */
import path from "node:path";
import { Document, Font, Page, Path, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { CHECK_PASS_LABEL, DISCLAIMER, REVIEW_LABEL } from "../../content/case-view.es.ts";
import { INCIDENT_REGISTRY_LABEL, INCIDENT_STATUS_LABEL, JUDICIAL_TYPE_LABEL, PROVIDER_FIGURES_NOTE, SOLVENCY_PROVIDER_LABEL } from "../../content/solvency.es.ts";
import { productLabel } from "../../content/products.es.ts";
import { caseRef, formatCompactEur, formatDate, formatEurWhole, formatFigure } from "../format.ts";
import type { BalanceSegment, SegmentTone } from "./balance.ts";
import type { CaseViewData } from "./load.ts";
import type { CasePackage } from "./package.ts";
import { layoutSankey, type PnlSankey } from "./sankey.ts";
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

const SANKEY_W = 507;

/** P&L Sankey: shapes as SVG, labels as positioned text so they use the registered Geist fonts. */
function Sankey({ model }: { model: PnlSankey }) {
  const l = layoutSankey(model, { width: SANKEY_W, height: 150, nodeWidth: 6, gap: 6, labelRight: 96, minSlot: 20 });
  const h = l.height + 4;
  return (
    <View style={{ position: "relative", width: SANKEY_W, height: h, marginTop: 4 }}>
      <Svg width={SANKEY_W} height={h} viewBox={`0 0 ${SANKEY_W} ${h}`}>
        {l.links.map((k, i) => (
          <Path key={i} d={k.path} fill={TONE[k.tone]} fillOpacity={k.tone === "asset-3" || k.tone === "asset-2" ? 0.55 : 0.75} />
        ))}
        {l.nodes.map((n) => <Rect key={n.id} x={n.x} y={n.y} width={l.nodeWidth} height={n.h} rx={2} fill={TONE[n.tone]} />)}
      </Svg>
      {l.nodes.map((n) => (
        <View key={n.id} style={{ position: "absolute", left: n.x + l.nodeWidth + 4, top: n.y + Math.max(n.h, 18) / 2 - 9 }}>
          <Text style={{ fontSize: 7, fontWeight: n.emphasis ? 600 : 400, color: C.ink, lineHeight: 1.25 }}>{n.label}</Text>
          <Text style={{ fontSize: 7, fontFamily: "GeistMono", color: C.ink2, lineHeight: 1.25 }}>{formatCompactEur(n.value)}</Text>
        </View>
      ))}
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

const PDF_ACTS = 12;

/** Registro Mercantil: the confirmed company's registry facts, current officers and latest BORME acts. */
function Registry({ d }: { d: CaseViewData }) {
  const { coverage, match, profile } = d.registry;
  const since = coverage ? `BORME revisado desde ${formatDate(coverage.from)}` : null;
  if (!profile) {
    const why = !coverage
      ? "El BORME aún no se ha importado."
      : match?.status === "none"
        ? "La entidad indicó que la empresa no figura entre los resultados del BORME."
        : "La entidad aún no ha confirmado qué empresa del BORME es la del caso.";
    return (
      <View wrap={false}>
        <Text style={s.h2}>Registro Mercantil</Text>
        <Text style={{ color: C.ink2 }}>{why}</Text>
      </View>
    );
  }
  const facts = [
    ["Hoja registral", profile.sheet],
    ["Constitución", profile.constitutedOn ? formatDate(profile.constitutedOn) : `Antes de ${formatDate(coverage?.from)}`],
    ["Capital", profile.capital ? `${eur(profile.capital.amount)} €` : "Sin datos"],
    ["Provincia", profile.province],
  ];
  return (
    <View>
      <View wrap={false}>
        <Text style={s.h2}>Registro Mercantil{since ? ` · ${since}` : ""}</Text>
        <Text style={{ fontWeight: 500 }}>{profile.name}{profile.formerNames.length ? <Text style={s.muted}>{`  · antes: ${profile.formerNames.join(", ")}`}</Text> : null}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          {facts.map(([label, value]) => (
            <View key={label} style={{ flex: 1, gap: 2 }}>
              <Text style={[s.muted, { fontSize: 8 }]}>{label}</Text>
              <Text style={s.mono}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[s.muted, { fontSize: 8.5, marginTop: 12, marginBottom: 2 }]}>Cargos vigentes</Text>
      {profile.officers.length === 0 && <Text style={{ color: C.ink2 }}>No hay nombramientos publicados en el periodo importado.</Text>}
      {profile.officers.map((o) => (
        <View key={`${o.role}|${o.name}`} style={s.tableRow} wrap={false}>
          <Text style={{ flex: 1 }}>{o.name}</Text>
          <Text style={[{ width: 110 }, { color: C.ink2 }]}>{o.role}</Text>
          <Text style={[s.mono, s.muted, { width: 70, textAlign: "right" }]}>{o.since ? formatDate(o.since) : "—"}</Text>
        </View>
      ))}
      <Text style={[s.muted, { fontSize: 8.5, marginTop: 12, marginBottom: 2 }]}>
        Actos publicados{profile.timeline.length > PDF_ACTS ? ` · últimos ${PDF_ACTS} de ${profile.timeline.length}` : ""}
      </Text>
      {profile.timeline.slice(0, PDF_ACTS).map((t, i) => (
        <View key={`${t.source}-${i}`} style={s.tableRow} wrap={false}>
          <Text style={[s.mono, s.muted, { width: 70 }]}>{formatDate(t.date)}</Text>
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: "row", gap: 5 }}>
              {t.severity && <View style={[s.dot, { marginTop: 3, backgroundColor: DOT[t.severity] }]} />}
              <Text style={{ fontWeight: 500 }}>{t.label}</Text>
            </View>
            {t.text ? <Text style={{ color: C.ink2, fontSize: 8.5 }}>{t.text.length > 220 ? `${t.text.slice(0, 219)}…` : t.text}</Text> : null}
          </View>
          <Text style={[s.mono, s.muted, { width: 90, textAlign: "right", fontSize: 8 }]}>{`anuncio ${t.source.split(":").at(-1)}`}</Text>
        </View>
      ))}
      <Text style={[s.muted, { fontSize: 8, marginTop: 6 }]}>Fuente: BORME, sección primera (actos inscritos). Cada anuncio se puede consultar en boe.es; el enlace está en la exportación JSON.</Text>
    </View>
  );
}

/** Informe de solvencia: provider figures (attributed), incidents and yearly figures, each with its PDF page. */
function Solvency({ d }: { d: CaseViewData }) {
  const r = d.solvency?.report ?? null;
  if (!d.solvency) return null;
  if (!r) {
    return (
      <View wrap={false}>
        <Text style={s.h2}>Informe de solvencia</Text>
        <Text style={{ color: C.ink2 }}>{d.solvency.status === "parsing" || d.solvency.status === "uploaded" ? "El informe se está leyendo." : "El informe no se ha podido leer con seguridad; consúltese el PDF original."}</Text>
      </View>
    );
  }
  const who = SOLVENCY_PROVIDER_LABEL[r.provider] ?? SOLVENCY_PROVIDER_LABEL.other;
  const figures = [
    r.rating && [`Rating ${who}`, `${r.rating.value}${r.rating.scale ? ` / ${r.rating.scale}` : ""}${r.rating.description ? ` · ${r.rating.description}` : ""}`],
    r.defaultProbability && [`Probabilidad de impago · ${who}`, `${formatFigure(r.defaultProbability.percent, "%", 2).number} %${r.defaultProbability.horizonMonths ? ` a ${r.defaultProbability.horizonMonths} meses` : ""}`],
    r.creditLimit && [`Límite recomendado · ${who}`, `${eur(r.creditLimit.amount)} €`],
  ].filter(Boolean) as [string, string][];
  const pg = (p: number | null) => (p ? `pág. ${p}` : "");
  return (
    <View>
      <View wrap={false}>
        <Text style={s.h2}>Informe de solvencia · {r.providerName ?? who} · {formatDate(r.reportDate)}</Text>
        {figures.length > 0 && (
          <>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {figures.map(([label, value]) => (
                <View key={label} style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.muted, { fontSize: 8 }]}>{label}</Text>
                  <Text style={s.mono}>{value}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.muted, { fontSize: 7.5, marginTop: 4 }]}>{PROVIDER_FIGURES_NOTE}</Text>
          </>
        )}
      </View>
      <Text style={[s.muted, { fontSize: 8.5, marginTop: 12, marginBottom: 2 }]}>Incidencias de pago</Text>
      {r.incidents.length === 0 && (
        <Text style={{ color: C.ink2 }}>{r.incidentsTotal?.count ? `El informe resume ${r.incidentsTotal.count} incidencias${r.incidentsTotal.amount ? ` por ${eur(r.incidentsTotal.amount)} €` : ""}, sin detalle.` : "El informe no recoge incidencias de pago."}</Text>
      )}
      {r.incidents.map((i, n) => (
        <View key={n} style={s.tableRow} wrap={false}>
          <Text style={{ flex: 1 }}>{i.creditor ?? INCIDENT_REGISTRY_LABEL[i.registry]}<Text style={s.muted}>{`  ${[INCIDENT_REGISTRY_LABEL[i.registry], i.date ? formatDate(i.date) : null, INCIDENT_STATUS_LABEL[i.status]].filter(Boolean).join(" · ")}`}</Text></Text>
          <Text style={[s.mono, { width: 80, textAlign: "right" }]}>{i.amount === null ? "—" : `${eur(i.amount)} €`}</Text>
          <Text style={[s.mono, s.muted, { width: 45, textAlign: "right", fontSize: 8 }]}>{pg(i.page)}</Text>
        </View>
      ))}
      <Text style={[s.muted, { fontSize: 8.5, marginTop: 12, marginBottom: 2 }]}>Incidencias judiciales y administrativas</Text>
      {r.judicial.length === 0 && <Text style={{ color: C.ink2 }}>El informe no recoge incidencias judiciales ni administrativas.</Text>}
      {r.judicial.map((j, n) => (
        <View key={n} style={s.tableRow} wrap={false}>
          <Text style={{ flex: 1 }}>{JUDICIAL_TYPE_LABEL[j.type]}<Text style={s.muted}>{`  ${[j.description, j.date ? formatDate(j.date) : null, INCIDENT_STATUS_LABEL[j.status]].filter(Boolean).join(" · ")}`}</Text></Text>
          <Text style={[s.mono, { width: 80, textAlign: "right" }]}>{j.amount === null ? "—" : `${eur(j.amount)} €`}</Text>
          <Text style={[s.mono, s.muted, { width: 45, textAlign: "right", fontSize: 8 }]}>{pg(j.page)}</Text>
        </View>
      ))}
      {r.financials.length > 0 && (
        <View wrap={false}>
          <Text style={[s.muted, { fontSize: 8.5, marginTop: 12, marginBottom: 2 }]}>Cifras según el informe</Text>
          {[...r.financials].sort((a, b) => b.fiscalYear - a.fiscalYear).map((f) => (
            <View key={f.fiscalYear} style={s.tableRow}>
              <Text style={[s.mono, { width: 50 }]}>{f.fiscalYear}</Text>
              <Text style={[s.mono, { flex: 1, textAlign: "right" }]}>{f.revenue === null ? "—" : `${eur(f.revenue)} €`}</Text>
              <Text style={[s.mono, { flex: 1, textAlign: "right" }]}>{f.netIncome === null ? "—" : `${eur(f.netIncome)} €`}</Text>
              <Text style={[s.mono, { flex: 1, textAlign: "right" }]}>{f.equity === null ? "—" : `${eur(f.equity)} €`}</Text>
              <Text style={[s.mono, s.muted, { width: 45, textAlign: "right", fontSize: 8 }]}>{pg(f.page)}</Text>
            </View>
          ))}
          <Text style={[s.muted, { fontSize: 7.5, marginTop: 3 }]}>Columnas: ventas, resultado del ejercicio, patrimonio neto.</Text>
        </View>
      )}
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

        {pkg.pnl && pkg.pnlPeriod && (
          <View wrap={false}>
            <Text style={s.h2}>
              Cuenta de resultados {pkg.pnlPeriod.months === 12 && pkg.pnlPeriod.start.endsWith("-01-01") ? pkg.pnlPeriod.end.slice(0, 4) : `${formatDate(pkg.pnlPeriod.start)} – ${formatDate(pkg.pnlPeriod.end)}`} · {formatCompactEur(pkg.pnl.revenue)} de cifra de negocios
            </Text>
            <Sankey model={pkg.pnl} />
          </View>
        )}
        {pkg.balance && pkg.balanceDate && (
          <View wrap={false}>
            <Text style={s.h2}>Balance a {formatDate(pkg.balanceDate)} · {formatCompactEur(pkg.balance.total)}</Text>
            <Bars label="Activo" segments={pkg.balance.top} />
            <Bars label="Patrimonio neto y pasivo" segments={pkg.balance.bottom} />
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

        <Solvency d={d} />

        <Registry d={d} />

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
