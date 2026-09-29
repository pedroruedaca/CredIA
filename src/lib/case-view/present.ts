/** Pure presentation helpers for the lender case view and the PDF. */
import { formatDate } from "../format.ts";
import type { Kpi } from "../kpis/engine.ts";
import type { CanonicalStatement } from "../pgc/mapping.ts";

// ------------------------------------------------------------------------------------------------ sources

export interface SourceDoc {
  id: string;
  kind: string;
  original_filename: string | null;
  issued_on?: string | null;
}

export interface SourceLabel {
  label: string;
  docId: string | null;
  page: number | null;
}

const KIND_SHORT: Record<string, string> = {
  trial_balance: "Sumas y saldos",
  norma43: "Norma 43",
  modelo200: "Modelo 200",
  cuentas_anuales: "Cuentas anuales",
  cirbe: "CIRBE",
  aeat_cert: "AEAT",
  tgss_cert: "TGSS",
};

/** "4300001" → "430·0001": PGC group, then subaccount, as the design writes accounts. */
export const formatAccount = (acct: string) => (acct.length > 3 ? `${acct.slice(0, 3)}·${acct.slice(3)}` : acct);

/**
 * Turns a source_ref into something a lender can read and open:
 *   doc:<id>:page:<n> · doc:<id>:sheet:<s>:row:<n> · doc:<id>:row:<n> · doc:<id>:line:<n> · doc:<id>
 *   holded:ledger:<start>..<end>:acct:<account>#sync:<id>
 */
export function describeSource(ref: string, docs: SourceDoc[]): SourceLabel {
  const holded = /^holded:ledger:([\d-]+)\.\.([\d-]+):acct:([^#]+)/.exec(ref);
  if (holded) return { label: `Holded · cuenta ${formatAccount(holded[3])}`, docId: null, page: null };
  const m = /^doc:([^:]+)(?::(.*))?$/.exec(ref);
  if (!m) return { label: ref, docId: null, page: null };
  const doc = docs.find((d) => d.id === m[1]) ?? null;
  const base = doc ? `${KIND_SHORT[doc.kind] ?? "Documento"}${doc.kind === "cirbe" && doc.issued_on ? ` ${formatDate(doc.issued_on)}` : ""}` : "Documento";
  const rest = m[2] ?? "";
  const page = /(?:^|:)page:(\d+)/.exec(rest);
  const row = /(?:^|:)row:(\d+)/.exec(rest);
  const line = /(?:^|:)line:(\d+)/.exec(rest);
  const where = page ? ` · pág. ${page[1]}` : row ? ` · fila ${row[1]}` : line ? ` · línea ${line[1]}` : "";
  return { label: `${base}${where}`, docId: doc?.id ?? null, page: page ? Number(page[1]) : null };
}

/** Link to open a source document (through the lender's RLS check); null for sources without a file. */
export const sourceHref = (caseId: string, docId: string | null, page: number | null) =>
  docId ? `/casos/${caseId}/documentos/${docId}${page ? `?pagina=${page}` : ""}` : undefined;

/** Distinct, readable sources (same label once), capped for display. */
export function summariseSources(refs: string[], docs: SourceDoc[], max = 6): { shown: SourceLabel[]; more: number } {
  const seen = new Map<string, SourceLabel>();
  for (const r of refs) {
    const s = describeSource(r, docs);
    if (!seen.has(s.label)) seen.set(s.label, s);
  }
  const all = [...seen.values()];
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}

// ------------------------------------------------------------------------------------------------ checks

export interface CheckRow {
  id: number;
  check_key: string;
  status: "pass" | "fail" | "not_applicable";
  severity: "high" | "warn" | "info";
  message: string;
  evidence: { values?: Record<string, number | string | null>; sources?: string[]; rule?: string } | Record<string, unknown>;
  source: string;
  document_id: string | null;
}

const SEV_ORDER = { high: 0, warn: 1, info: 2 } as const;

/** Open checks high → warn → info (stable within a severity), and passing checks. */
export function splitChecks<T extends Pick<CheckRow, "status" | "severity">>(checks: T[]): { open: T[]; passed: T[] } {
  const open = checks.filter((c) => c.status === "fail").map((c, i) => ({ c, i }));
  open.sort((a, b) => SEV_ORDER[a.c.severity] - SEV_ORDER[b.c.severity] || a.i - b.i);
  return { open: open.map((x) => x.c), passed: checks.filter((c) => c.status === "pass") };
}

// ------------------------------------------------------------------------------------------------ KPIs

export type KpiMap = Partial<Record<Kpi["key"], Kpi>>;
export const kpiMap = (kpis: Kpi[]): KpiMap => Object.fromEntries(kpis.map((k) => [k.key, k]));

/** DFN / EBITDA using CIRBE drawn debt instead of book debt; null when not meaningful. */
export function cirbeNetDebtToEbitda(s: CanonicalStatement, cirbeDrawn: number): Kpi {
  const ebitdaA = (s.incomeStatement.ebitda * 12) / s.months;
  const netDebt = cirbeDrawn - s.balanceSheet.assets.cash - s.balanceSheet.assets.shortTermInvestments;
  const value = s.pnlAvailable && ebitdaA > 0 ? Math.round((netDebt / ebitdaA) * 100) / 100 : null;
  return {
    key: "netDebtToEbitda",
    value,
    unit: "x",
    formula: "(dispuesto CIRBE − tesorería − inversiones a corto plazo) / EBITDA anualizado",
    inputs: { cirbeDrawn, cash: s.balanceSheet.assets.cash, shortTermInvestments: s.balanceSheet.assets.shortTermInvestments, ebitdaAnnualised: Math.round(ebitdaA * 100) / 100 },
    note: value === null ? (s.pnlAvailable ? "EBITDA no positivo; ratio no significativo" : "Sin cuenta de resultados") : "Variante con la deuda declarada en CIRBE",
  };
}

// ------------------------------------------------------------------------------------------------ KPI row

export interface KpiTile {
  id: string;
  label: string;
  /** Main figure; `secondary` renders as "/42d" after it (DSO/DPO). */
  value: number | null;
  unit: Kpi["unit"];
  secondary: number | null;
  /** Line under the figure: YTD comparison or a variant, already worded. */
  sub: string | null;
  /** KPIs behind the tile, with formula and inputs, for the popover. */
  details: { period: string; kpi: Kpi }[];
}

const fx = (v: number | null | undefined, unit: Kpi["unit"]) => {
  if (v === null || v === undefined) return "—";
  const d = unit === "x" ? 2 : 0;
  const n = v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  return unit === "x" ? `${n}x` : unit === "days" ? `${n}d` : unit === "%" ? `${n} %` : `${n} €`;
};
const arrow = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || a === b ? "" : b > a ? " ↑" : " ↓");

/**
 * The five metrics of the case header. Base period: closed year when present, else YTD (then no comparison).
 * DFN/EBITDA uses CIRBE drawn debt when a CIRBE is available and shows the books figure alongside.
 */
export function kpiTiles(closed: { kpis: Kpi[]; statement: CanonicalStatement } | null, ytd: { kpis: Kpi[]; statement: CanonicalStatement } | null, cirbeDrawn: number | null): KpiTile[] {
  const base = closed ?? ytd;
  if (!base) return [];
  const b = kpiMap(base.kpis);
  const y = closed && ytd ? kpiMap(ytd.kpis) : null;
  const basePeriod = closed ? `Ejercicio ${closed.statement.period.end.slice(0, 4)}` : "Año en curso";
  const det = (key: Kpi["key"]) => [
    ...(b[key] ? [{ period: basePeriod, kpi: b[key]! }] : []),
    ...(y?.[key] ? [{ period: "Año en curso (anualizado)", kpi: y[key]! }] : []),
  ];
  const ytdSub = (key: Kpi["key"]) => (y?.[key] ? `YTD ${fx(y[key]!.value, y[key]!.unit)}${arrow(b[key]?.value, y[key]!.value)}` : null);

  const tiles: KpiTile[] = [
    { id: "dscr", label: "DSCR", value: b.dscr?.value ?? null, unit: "x", secondary: null, sub: ytdSub("dscr"), details: det("dscr") },
    { id: "interestCoverage", label: "Cobertura int.", value: b.interestCoverage?.value ?? null, unit: "x", secondary: null, sub: ytdSub("interestCoverage"), details: det("interestCoverage") },
  ];

  if (cirbeDrawn !== null) {
    const c = cirbeNetDebtToEbitda(base.statement, cirbeDrawn);
    tiles.push({
      id: "netDebtToEbitda",
      label: "DFN / EBITDA",
      value: c.value,
      unit: "x",
      secondary: null,
      sub: `con CIRBE · libros ${fx(b.netDebtToEbitda?.value, "x")}`,
      details: [{ period: `${basePeriod} · con CIRBE`, kpi: c }, ...det("netDebtToEbitda").map((d) => ({ ...d, period: `${d.period} · libros` }))],
    });
  } else {
    tiles.push({ id: "netDebtToEbitda", label: "DFN / EBITDA", value: b.netDebtToEbitda?.value ?? null, unit: "x", secondary: null, sub: ytdSub("netDebtToEbitda"), details: det("netDebtToEbitda") });
  }

  tiles.push({
    id: "currentRatio",
    label: "Liquidez",
    value: b.currentRatio?.value ?? null,
    unit: "x",
    secondary: null,
    sub: b.quickRatio ? `ácida ${fx(b.quickRatio.value, "x")}` : null,
    details: [...det("currentRatio"), ...det("quickRatio")],
  });

  const ydso = y?.dso?.value;
  const ydpo = y?.dpo?.value;
  tiles.push({
    id: "dsoDpo",
    label: "DSO / DPO",
    value: b.dso?.value ?? null,
    unit: "days",
    secondary: b.dpo?.value ?? null,
    sub: y && (ydso != null || ydpo != null) ? `YTD ${ydso ?? "—"}/${ydpo ?? "—"}d` : null,
    details: [...det("dso"), ...det("dpo")],
  });
  return tiles;
}
