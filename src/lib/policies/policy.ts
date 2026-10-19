/**
 * Credit policies («Políticas»): thresholds a lender sets on the KPIs, applied to a case to see whether its figures
 * fall inside them. Pure.
 *
 * Product decision (Oct 2026): the lender writes the criteria; credIA only compares the case's KPIs with them and says
 * which are met. The outcome is informational («según vuestra política…»), never a credIA score or decision, and it
 * never feeds the checks. Stored in credit_policies (migration 0029) as [{ metric, op, threshold, period }]; a case
 * points at the policy applied to it (cases.policy_id).
 *
 * A threshold is a number, factor × another KPI of the case in the same unit (stored as { against_metric, factor }),
 * or factor × a parameter the analyst enters on each case (0031/0032, parameters.ts; stored as { parameter_id, factor }).
 * Both KPIs read the criterion's period (bank KPIs their own window). A missing KPI, or a parameter the case has no
 * value for, leaves the criterion «sin datos».
 */
import { z } from "zod";
import { BANK_KPI_KEYS, BANK_KPI_UNIT, type BankKpiKey, type BankKpiSet } from "../kpis/bank.ts";
import { KPI_LABEL } from "../../content/case-view.es.ts";
import { UNIT, type Kpi, type KpiKey } from "../kpis/engine.ts";
import type { PolicyParameter, ResolvedParameter } from "./parameters.ts";

/** KPIs from the books a criterion can name (every accounting KPI, plus the analyst's adjusted gross margin). */
export const ACCOUNTING_POLICY_METRICS = [
  "dscr", "interestCoverage", "ebitCoverage", "netDebtToEbitda", "debtToEbitda", "debtToEquity", "liabilitiesToEquity",
  "currentRatio", "quickRatio", "workingCapital", "financialDebt", "netDebt",
  "revenue", "ebitda", "ebitdaMargin", "grossMargin", "adjustedGrossMargin", "netMargin", "roa", "roe",
  "dso", "dpo", "dio", "ccc", "assetTurnover",
] as const satisfies readonly (KpiKey | "adjustedGrossMargin")[];
export const POLICY_METRICS = [...ACCOUNTING_POLICY_METRICS, ...BANK_KPI_KEYS] as const;
export type PolicyMetric = (typeof POLICY_METRICS)[number];

export const POLICY_METRIC_GROUPS: { id: "accounting" | "bank"; metrics: readonly PolicyMetric[] }[] = [
  { id: "accounting", metrics: ACCOUNTING_POLICY_METRICS },
  { id: "bank", metrics: BANK_KPI_KEYS },
];

export const isBankMetric = (m: PolicyMetric): m is BankKpiKey => (BANK_KPI_KEYS as readonly string[]).includes(m);

/** Unit of a metric; thresholds are written in it (a percentage as 12,5 for 12,5 %). */
export function metricUnit(m: PolicyMetric): Kpi["unit"] {
  if (isBankMetric(m)) return BANK_KPI_UNIT[m];
  if (m === "adjustedGrossMargin") return "%";
  return UNIT[m];
}

/** gte: the KPI must be at least the threshold; lte: at most. */
export type PolicyOp = "gte" | "lte";
/** Which accounting period a criterion reads: the base period (closed year if any, else year to date) or a fixed one. Bank metrics have their own window. */
export type PolicyPeriod = "base" | "closed" | "ytd";

interface CriterionBase {
  metric: PolicyMetric;
  op: PolicyOp;
  period: PolicyPeriod;
}
/**
 * A fixed number, factor × another KPI («Deuda financiera ≤ 3 × EBITDA»), or factor × a parameter entered on the case
 * («Ingresos ≥ 4 × Importe solicitado»).
 */
export type PolicyCriterion = CriterionBase &
  (
    | { threshold: number; against?: undefined; parameter?: undefined }
    | { threshold?: undefined; against: { metric: PolicyMetric; factor: number }; parameter?: undefined }
    | { threshold?: undefined; against?: undefined; parameter: { id: string; factor: number } }
  );

export interface CreditPolicy {
  id: string;
  name: string;
  description: string | null;
  criteria: PolicyCriterion[];
}

export const MAX_CRITERIA = 30;

const StoredCriterion = z
  .object({ metric: z.string(), op: z.string(), threshold: z.union([z.number(), z.string()]).optional(), period: z.string().optional(), parameter_id: z.string().optional(), against_metric: z.string().optional(), factor: z.union([z.number(), z.string()]).optional() })
  .passthrough();
const PARAM_ID = /^[0-9a-f-]{36}$/i;

/** A factor in front of another KPI or a parameter: a positive number, 1 when empty. */
export function parseFactor(v: unknown): number | null {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return 1;
  const n = parseThreshold(v);
  return n !== null && n > 0 ? n : null;
}

/** "1,25" / "1.25" / "-50.000" / 1.25 → number; null when it is not a number. */
export function parseThreshold(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s|€|%|x$|días?$/gi, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma > dot) s = s.replace(/\./g, "").replace(",", "."); // 1.234,5
  else if (comma >= 0) s = s.replace(/,/g, ""); // 1,234.5
  else if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, ""); // 50.000 → thousands
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Any stored criteria → valid ones: known metrics and operators, a numeric threshold, a known period; at most MAX_CRITERIA. */
export function normalizeCriteria(raw: unknown): PolicyCriterion[] {
  const parsed = z.array(z.unknown()).safeParse(raw);
  if (!parsed.success) return [];
  const out: PolicyCriterion[] = [];
  for (const item of parsed.data) {
    const c = StoredCriterion.safeParse(item);
    if (!c.success) continue;
    if (!(POLICY_METRICS as readonly string[]).includes(c.data.metric)) continue;
    if (c.data.op !== "gte" && c.data.op !== "lte") continue;
    const metric = c.data.metric as PolicyMetric;
    const period: PolicyPeriod = isBankMetric(metric) ? "base" : c.data.period === "closed" || c.data.period === "ytd" ? c.data.period : "base";
    if (c.data.against_metric) {
      // Another KPI, in the same unit and not the criterion's own.
      const against = c.data.against_metric as PolicyMetric;
      if (!(POLICY_METRICS as readonly string[]).includes(against) || against === metric || metricUnit(against) !== metricUnit(metric)) continue;
      const factor = parseFactor(c.data.factor);
      if (factor === null) continue;
      out.push({ metric, op: c.data.op, period, against: { metric: against, factor } });
    } else if (c.data.parameter_id && PARAM_ID.test(c.data.parameter_id)) {
      const factor = parseFactor(c.data.factor);
      if (factor === null) continue;
      out.push({ metric, op: c.data.op, period, parameter: { id: c.data.parameter_id, factor } });
    } else {
      const threshold = parseThreshold(c.data.threshold);
      if (threshold === null) continue;
      out.push({ metric, op: c.data.op, threshold, period });
    }
    if (out.length === MAX_CRITERIA) break;
  }
  return out;
}

export type PolicyFieldErrors = Partial<Record<"name" | "description" | "criteria", string>>;

/** Stored criteria JSON: another KPI as against_metric + factor, a parameter as parameter_id + factor. */
export type StoredCriterionJson = { metric: PolicyMetric; op: PolicyOp; period: PolicyPeriod } & ({ threshold: number } | { against_metric: PolicyMetric; factor: number } | { parameter_id: string; factor: number });
export const criteriaToStored = (criteria: PolicyCriterion[]): StoredCriterionJson[] =>
  criteria.map((c) => {
    const base = { metric: c.metric, op: c.op, period: c.period };
    if (c.against) return { ...base, against_metric: c.against.metric, factor: c.against.factor };
    if (c.parameter) return { ...base, parameter_id: c.parameter.id, factor: c.parameter.factor };
    return { ...base, threshold: c.threshold };
  });

/** The parameters a policy's criteria use, once each. */
export const criteriaParameterIds = (criteria: readonly PolicyCriterion[]) => [...new Set(criteria.flatMap((c) => (c.parameter ? [c.parameter.id] : [])))];

/**
 * The policy form: name, description and `criteria` (JSON written by the criteria editor). A criterion with a
 * threshold that is not a number is an error, not dropped silently. Another KPI must be in the same unit; with the
 * lender's `parameters`, a criterion on a parameter must name one of them, in its KPI's unit.
 */
export function parsePolicyForm(v: Record<string, string>, parameters?: readonly PolicyParameter[]):
  | { ok: true; data: { name: string; description: string | null; criteria: PolicyCriterion[] } }
  | { ok: false; errors: PolicyFieldErrors } {
  const errors: PolicyFieldErrors = {};
  const name = (v.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Pon un nombre de al menos 2 caracteres.";
  else if (name.length > 80) errors.name = "Máximo 80 caracteres.";
  const description = (v.description ?? "").trim();
  if (description.length > 300) errors.description = "Máximo 300 caracteres.";
  let raw: unknown = [];
  try {
    raw = JSON.parse(v.criteria || "[]");
  } catch {
    raw = null;
  }
  const rows = Array.isArray(raw) ? raw : [];
  const criteria = normalizeCriteria(rows);
  if (!Array.isArray(raw)) errors.criteria = "No hemos podido leer los criterios. Vuelve a añadirlos.";
  else if (rows.some((r) => {
    const x = (r ?? {}) as { threshold?: unknown; parameter_id?: unknown; against_metric?: unknown; factor?: unknown };
    return x.parameter_id || x.against_metric ? parseFactor(x.factor) === null : parseThreshold(x.threshold) === null;
  })) errors.criteria = "Cada criterio necesita un umbral numérico (por ejemplo 1,25), o un factor mayor que 0 delante del indicador o el parámetro.";
  else if (rows.some((r) => {
    const x = (r ?? {}) as { metric?: unknown; against_metric?: unknown };
    if (!x.against_metric) return false;
    const known = (m: unknown): m is PolicyMetric => (POLICY_METRICS as readonly unknown[]).includes(m);
    return !known(x.metric) || !known(x.against_metric) || x.against_metric === x.metric || metricUnit(x.against_metric) !== metricUnit(x.metric);
  })) errors.criteria = "Un indicador solo se compara con otro indicador distinto y en la misma unidad.";
  else if (rows.length > MAX_CRITERIA) errors.criteria = `Como máximo ${MAX_CRITERIA} criterios.`;
  else if (criteria.length === 0) errors.criteria = "Añade al menos un criterio.";
  else if (criteria.length !== rows.length) errors.criteria = "Hay criterios incompletos.";
  else if (parameters) {
    for (const c of criteria) {
      if (!c.parameter) continue;
      const p = parameters.find((x) => x.id === c.parameter!.id);
      if (!p) errors.criteria = "Un criterio usa un parámetro que ya no existe. Elige otro.";
      else if (p.unit !== metricUnit(c.metric)) errors.criteria = `«${p.name}» no está en la misma unidad que el indicador de su criterio.`;
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, description: description || null, criteria } };
}

// ---------------------------------------------------------------------------------------------------------------
// Applying a policy to a case

export type CriterionStatus = "met" | "not_met" | "no_data";
/** within: every criterion met · outside: at least one not met · incomplete: none failed, some without data. */
export type PolicyOutcome = "within" | "outside" | "incomplete";

export interface CriterionResult {
  criterion: PolicyCriterion;
  unit: Kpi["unit"];
  value: number | null;
  status: CriterionStatus;
  /** Which figures were read: "closed" / "ytd" for the books, "bank" for the bank movements; null without data. */
  source: "closed" | "ytd" | "bank" | null;
  /** Why there is no value (the KPI's own note, the other KPI or the parameter missing), when there is none. */
  note: string | null;
  /** The threshold applied: the number, or factor × the other KPI's or the parameter's value (null when it has none). */
  limit: number | null;
  /** The other KPI behind the threshold, with its value for this case and where it was read. */
  against: { metric: PolicyMetric; factor: number; value: number | null; source: "closed" | "ytd" | "bank" | null } | null;
  /** The parameter behind the threshold, with its value for this case. */
  parameter: (ResolvedParameter & { factor: number }) | null;
}

export interface PolicyResult {
  outcome: PolicyOutcome;
  results: CriterionResult[];
  met: number;
  notMet: number;
  noData: number;
}

export interface PolicyInputs {
  closed: Kpi[];
  ytd: Kpi[];
  bank: BankKpiSet | null;
}

const meets = (value: number, op: PolicyOp, limit: number) => (op === "gte" ? value >= limit : value <= limit);

/** A KPI of the case for a criterion's period: bank KPIs from their window, the books from the closed year or YTD. */
function pickKpi(k: PolicyInputs, metric: PolicyMetric, period: PolicyPeriod): { kpi: Kpi | undefined; source: CriterionResult["source"] } {
  if (isBankMetric(metric)) {
    const kpi = k.bank?.kpis.find((x) => x.key === metric);
    return { kpi, source: kpi ? "bank" : null };
  }
  const order: ("closed" | "ytd")[] = period === "closed" ? ["closed"] : period === "ytd" ? ["ytd"] : k.closed.length ? ["closed"] : ["ytd"];
  for (const p of order) {
    const kpi = k[p].find((x) => x.key === metric);
    if (kpi) return { kpi, source: p };
  }
  return { kpi: undefined, source: null };
}

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Compares each criterion with the case's KPI of its period, against its number, factor × another KPI of the same
 * period, or factor × its parameter's value for this case. Missing figures (a KPI, the other KPI, a per-case value, a
 * deleted parameter) are «sin datos», never a pass or a fail.
 */
export function evaluatePolicy(criteria: PolicyCriterion[], k: PolicyInputs, parameters: readonly ResolvedParameter[] = []): PolicyResult {
  const results = criteria.map((c): CriterionResult => {
    const unit = metricUnit(c.metric);
    let limit: number | null = null;
    let limitNote: string | null = null;
    let against: CriterionResult["against"] = null;
    let parameter: CriterionResult["parameter"] = null;
    if (c.against) {
      const o = pickKpi(k, c.against.metric, c.period);
      const v = finite(o.kpi?.value) ? o.kpi!.value! : null;
      against = { metric: c.against.metric, factor: c.against.factor, value: v, source: v === null ? null : o.source };
      limit = v === null ? null : c.against.factor * v;
      if (v === null) limitNote = o.kpi?.note ?? `Sin datos de ${KPI_LABEL[c.against.metric] ?? c.against.metric} en este caso.`;
    } else if (c.parameter) {
      const p = parameters.find((x) => x.id === c.parameter!.id) ?? null;
      parameter = p ? { ...p, factor: c.parameter.factor } : null;
      limit = p && p.unit === unit && p.value !== null ? c.parameter.factor * p.value : null;
      limitNote = !p ? "El parámetro de este criterio ya no existe." : p.unit !== unit ? `«${p.name}» no está en la unidad del indicador.` : p.value === null ? `Falta «${p.name}» en este caso.` : null;
    } else {
      limit = c.threshold;
    }
    const { kpi, source } = pickKpi(k, c.metric, c.period);
    const value = kpi?.value ?? null;
    if (!finite(value)) {
      return { criterion: c, unit, value: null, status: "no_data", source: kpi ? source : null, note: kpi?.note ?? limitNote ?? null, limit, against, parameter };
    }
    if (limit === null) return { criterion: c, unit, value, status: "no_data", source, note: limitNote, limit, against, parameter };
    return { criterion: c, unit, value, status: meets(value, c.op, limit) ? "met" : "not_met", source, note: null, limit, against, parameter };
  });
  const met = results.filter((r) => r.status === "met").length;
  const notMet = results.filter((r) => r.status === "not_met").length;
  const noData = results.filter((r) => r.status === "no_data").length;
  const outcome: PolicyOutcome = notMet > 0 ? "outside" : noData > 0 ? "incomplete" : "within";
  return { outcome, results, met, notMet, noData };
}

/** Parameters the criteria use that this case has no value for, once each (the «Política» panel asks for them). */
export function missingCaseParameters(criteria: readonly PolicyCriterion[], parameters: readonly ResolvedParameter[]): ResolvedParameter[] {
  return criteriaParameterIds(criteria).flatMap((id) => parameters.filter((p) => p.id === id && p.value === null));
}

/** Metrics where less is better (debt, days, returns…): a new criterion on them starts as «como máximo». */
const LOWER_IS_BETTER = new Set<PolicyMetric>([
  "netDebtToEbitda", "debtToEbitda", "debtToEquity", "liabilitiesToEquity", "financialDebt", "netDebt", "dso", "dio", "ccc",
  "netBurn", "inflowVolatility", "debtServiceBurden", "returnedItems", "overdraftDays", "returnedReceiptsRatio",
]);
export const defaultOp = (m: PolicyMetric): PolicyOp => (LOWER_IS_BETTER.has(m) ? "lte" : "gte");

/** A threshold as the form shows it: Spanish decimals, no grouping ("1,25", "-50000"). */
export const thresholdText = (n: number) => String(n).replace(".", ",");
