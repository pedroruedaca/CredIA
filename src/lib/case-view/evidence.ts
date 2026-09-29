/**
 * What the evidence panel shows for one check: a headline delta, a two-bar comparison, evidence rows (mismatches
 * flagged), readable values and the gaps where the stored evidence cannot back a richer view. Pure; the panel,
 * the PDF and the JSON export all read this.
 */
import { CHECK_NAME, VALUE_LABEL } from "../../content/case-view.es.ts";
import { formatCompactEur, formatDate, formatEurWhole, formatFigure, type FigureUnit } from "../format.ts";
import type { CanonicalStatement } from "../pgc/mapping.ts";
import type { CirbeExtraction } from "../schema/canonical.ts";
import { formatAccount, type CheckRow } from "./present.ts";

export interface EvidenceRow {
  label: string;
  mono?: boolean;
  a: string;
  b?: string;
  mismatch?: boolean;
}

export interface EvidenceView {
  slug: string;
  key: string;
  name: string;
  severity: CheckRow["severity"];
  status: CheckRow["status"];
  message: string;
  /** One-line evidence under the title in the list. */
  evidenceLine: string;
  headline: { value: number; unit: FigureUnit; signed: boolean; caption: string } | null;
  compare: { label: string; value: number; highlight?: number }[] | null;
  table: { title: string; columns: [string, string] | [string, string, string]; rows: EvidenceRow[] } | null;
  values: { label: string; value: string }[];
  rule: string | null;
  sources: string[];
  gaps: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAIN = new Set(["account", "overlap_months", "months_with_payments", "accounts", "age_days", "max_age_days", "fiscal_year", "months"]);

/** Evidence values as the lender reads them: money in €, ratios, dates, counts. */
export function formatEvidenceValue(key: string, v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") {
    if (DATE.test(v)) return formatDate(v);
    if (key === "result") return v === "al_corriente" ? "Al corriente" : v === "no_al_corriente" ? "No al corriente" : "Sin leer";
    return v;
  }
  if (PLAIN.has(key)) return String(v);
  if (key === "ratio") return `${formatFigure(v, "x", 2).number} x`;
  if (key === "vat_rate" || key === "vatRate") return `${formatFigure(v * 100, "%", 0).number} %`;
  return `${formatEurWhole(v)} €`;
}

/** Stable deep-link id per check: its key, suffixed when a key repeats (e.g. one per period). */
export function checkSlugs<T extends { check_key: string }>(checks: T[]): (T & { slug: string })[] {
  const seen = new Map<string, number>();
  return checks.map((c) => {
    const n = (seen.get(c.check_key) ?? 0) + 1;
    seen.set(c.check_key, n);
    return { ...c, slug: n === 1 ? c.check_key : `${c.check_key}-${n}` };
  });
}

type Ev = { values?: Record<string, number | string | null>; sources?: string[]; rule?: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const eurText = (n: number) => `${formatEurWhole(n)} €`;
const compact = formatCompactEur;

export function evidenceView(
  check: CheckRow & { slug: string },
  ctx: { closed: CanonicalStatement | null; ytd: CanonicalStatement | null; cirbe: CirbeExtraction | null },
): EvidenceView {
  const ev = (check.evidence ?? {}) as Ev;
  const values = ev.values ?? {};
  const base: EvidenceView = {
    slug: check.slug,
    key: check.check_key,
    name: CHECK_NAME[check.check_key] ?? check.check_key,
    severity: check.severity,
    status: check.status,
    message: check.message,
    evidenceLine: "",
    headline: null,
    compare: null,
    table: null,
    values: Object.entries(values).map(([k, v]) => ({ label: VALUE_LABEL[k] ?? k, value: formatEvidenceValue(k, v) })),
    rule: ev.rule ?? null,
    sources: ev.sources ?? [],
    gaps: [],
  };

  switch (check.check_key) {
    case "cirbe_vs_books_debt": {
      const cirbeDrawn = num(values.cirbe_drawn);
      const books = num(values.books_financial_debt);
      const diff = num(values.difference);
      if (cirbeDrawn === null || books === null || diff === null) break;
      base.headline = { value: diff, unit: "EUR", signed: true, caption: diff >= 0 ? "de deuda en CIRBE que no aparece en libros" : "de deuda en libros que no aparece en CIRBE" };
      base.compare = [
        { label: "Libros", value: books, highlight: diff < 0 ? -diff : undefined },
        { label: "CIRBE", value: cirbeDrawn, highlight: diff > 0 ? diff : undefined },
      ];
      const statement = [ctx.closed, ctx.ytd].find((s) => s?.period.end === values.statement_period_end) ?? ctx.closed ?? ctx.ytd;
      const bookLines = statement ? [...(statement.lineage.longTermFinancialDebt ?? []), ...(statement.lineage.shortTermFinancialDebt ?? [])] : [];
      if (ctx.cirbe) {
        base.table = {
          title: "Posiciones CIRBE",
          columns: ["Posición", "Dispuesto"],
          rows: ctx.cirbe.positions.map((p) => ({ label: [p.entity, p.product].filter(Boolean).join(" · ") || "Posición", a: eurText(p.drawn) })),
        };
      }
      if (bookLines.length) {
        base.values = [
          ...base.values,
          ...bookLines.map((l) => ({ label: `Cuenta ${formatAccount(l.account)}`, value: eurText(l.amount) })),
        ];
      }
      base.gaps.push("La contabilidad no identifica la entidad de cada préstamo, así que no se empareja cada posición CIRBE con una cuenta: se muestran ambas listas.");
      base.evidenceLine = `CIRBE ${compact(cirbeDrawn)} · libros ${compact(books)}${values.cirbe_as_of ? ` · CIRBE ${formatDate(String(values.cirbe_as_of))}` : ""}`;
      break;
    }
    case "cirbe_overdue": {
      const overdue = num(values.overdue);
      if (overdue !== null && overdue > 0) base.headline = { value: overdue, unit: "EUR", signed: false, caption: "de riesgo vencido o dudoso en CIRBE" };
      if (ctx.cirbe) {
        base.table = {
          title: "Posiciones CIRBE",
          columns: ["Posición", "Dispuesto", "Vencido"],
          rows: ctx.cirbe.positions.map((p) => ({
            label: [p.entity, p.product].filter(Boolean).join(" · ") || "Posición",
            a: eurText(p.drawn),
            b: p.overdue ? eurText(p.overdue) : "—",
            mismatch: (p.overdue ?? 0) > 0,
          })),
        };
      }
      base.evidenceLine = values.cirbe_as_of ? `CIRBE ${formatDate(String(values.cirbe_as_of))}` : "CIRBE";
      break;
    }
    case "n43_inflows_vs_revenue": {
      const inflows = num(values.bank_inflows);
      const expected = num(values.expected_from_revenue);
      const ratio = num(values.ratio);
      if (inflows === null || expected === null || ratio === null) break;
      base.headline = { value: Math.round((ratio - 1) * 100), unit: "%", signed: true, caption: "cobros bancarios frente a ventas con IVA del periodo común" };
      base.compare = [
        { label: "Ventas + IVA", value: expected },
        { label: "Cobros", value: inflows },
      ];
      base.evidenceLine = `${values.overlap_months ?? "?"} meses comparados · ${formatDate(String(values.overlap_start))} – ${formatDate(String(values.overlap_end))}`;
      base.gaps.push("La comparación es agregada: no se desglosa por cuenta bancaria ni por cliente.");
      break;
    }
    case "m200_vs_books_revenue":
    case "m200_vs_books_netIncome":
    case "m200_vs_books_equity": {
      const declared = num(values.modelo200);
      const books = num(values.books);
      const diff = num(values.difference);
      if (declared === null || books === null || diff === null) break;
      base.headline = { value: diff, unit: "EUR", signed: true, caption: "libros menos Modelo 200" };
      base.compare = [
        { label: "Modelo 200", value: declared },
        { label: "Libros", value: books },
      ];
      base.evidenceLine = `Ejercicio ${values.fiscal_year ?? "—"} · Modelo 200 ${compact(declared)} · libros ${compact(books)}`;
      break;
    }
    case "aeat_cert_valid":
    case "tgss_cert_valid": {
      base.evidenceLine = [values.issued_on ? `Emitido ${formatDate(String(values.issued_on))}` : null, values.age_days !== undefined && values.age_days !== null ? `${values.age_days} días` : null]
        .filter(Boolean)
        .join(" · ");
      break;
    }
    case "overdrawn_bank_account":
    case "unmapped_account": {
      const amount = num(values.amount ?? values.net);
      if (amount !== null) base.headline = { value: amount, unit: "EUR", signed: false, caption: check.check_key === "overdrawn_bank_account" ? "de saldo acreedor tratado como deuda a corto plazo" : "sin línea de balance o resultados asignada" };
      if (typeof values.account === "string") base.evidenceLine = `Cuenta ${formatAccount(values.account)}`;
      base.values = base.values.filter((v) => v.label !== VALUE_LABEL.account);
      break;
    }
    case "n43_overdrawn": {
      const entries = Object.entries(values).filter(([, v]) => typeof v === "number" && v < 0) as [string, number][];
      if (entries.length) {
        base.table = { title: "Saldo mínimo por cuenta", columns: ["Cuenta", "Saldo mínimo"], rows: entries.map(([k, v]) => ({ label: k, mono: true, a: eurText(v), mismatch: true })) };
        base.values = [];
        base.evidenceLine = entries.map(([k]) => k).join(" · ");
      }
      break;
    }
    default:
      break;
  }

  if (!base.headline && !base.table && check.status === "fail") base.gaps.push("Esta verificación solo guarda el texto y los valores comparados; no hay desglose por partida.");
  if (!base.evidenceLine) base.evidenceLine = base.values.slice(0, 2).map((v) => `${v.label} ${v.value}`).join(" · ");
  if (base.sources.length === 0) base.gaps.push("Sin referencia a documento o apunte de origen.");
  return base;
}
