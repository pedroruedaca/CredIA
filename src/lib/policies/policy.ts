/**
 * Credit policies («Políticas»): thresholds a lender sets on the KPIs, applied to a case to see whether its figures
 * fall inside them. Pure.
 *
 * Product decision (Oct 2026): the lender writes the criteria; credIA only compares the case's KPIs with them and says
 * which are met. The outcome is informational («según vuestra política…»), never a credIA score or decision, and it
 * never feeds the checks. Stored in credit_policies (migration 0029) as [{ metric, op, threshold, period }]; a case
 * points at the policy applied to it (cases.policy_id).
 *
 * A threshold is either a number or factor × a parameter of the lender (0031, parameters.ts): stored as
 * { metric, op, period, parameter_id, factor }. The parameter must be in the KPI's unit; a per-case parameter the case
 * has no value for leaves the criterion «sin datos».
 */
import { z } from "zod";
import { BANK_KPI_KEYS, BANK_KPI_UNIT, type BankKpiKey, type BankKpiSet } from "../kpis/bank.ts";
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
/** A fixed number, or factor × a parameter (KPI ≥ 4 × «Importe solicitado»). */
export type PolicyCriterion = CriterionBase & ({ threshold: number; parameter?: undefined } | { threshold?: undefined; parameter: { id: string; factor: number } });

export interface CreditPolicy {
  id: string;
  name: string;
  description: string | null;
  criteria: PolicyCriterion[];
}

export const MAX_CRITERIA = 30;

const StoredCriterion = z
  .object({ metric: z.string(), op: z.string(), threshold: z.union([z.number(), z.string()]).optional(), period: z.string().optional(), parameter_id: z.string().optional(), factor: z.union([z.number(), z.string()]).optional() })
  .passthrough();
const PARAM_ID = /^[0-9a-f-]{36}$/i;

/** A factor in front of a parameter: a positive number, 1 when empty. */
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
    if (c.data.parameter_id && PARAM_ID.test(c.data.parameter_id)) {
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

/** Stored criteria JSON: the parameter as parameter_id + factor. */
export type StoredCriterionJson = { metric: PolicyMetric; op: PolicyOp; period: PolicyPeriod } & ({ threshold: number } | { parameter_id: string; factor: number });
export const criteriaToStored = (criteria: PolicyCriterion[]): StoredCriterionJson[] =>
  criteria.map((c) => (c.parameter ? { metric: c.metric, op: c.op, period: c.period, parameter_id: c.parameter.id, factor: c.parameter.factor } : { metric: c.metric, op: c.op, period: c.period, threshold: c.threshold }));

/** The parameters a policy's criteria use, once each. */
export const criteriaParameterIds = (criteria: readonly PolicyCriterion[]) => [...new Set(criteria.flatMap((c) => (c.parameter ? [c.parameter.id] : [])))];

/**
 * The policy form: name, description and `criteria` (JSON written by the criteria editor). A criterion with a
 * threshold that is not a number is an error, not dropped silently. With the lender's `parameters`, a criterion on a
 * parameter must name one of them, in its KPI's unit.
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
    const x = (r ?? {}) as { threshold?: unknown; parameter_id?: unknown; factor?: unknown };
    return x.parameter_id ? parseFactor(x.factor) === null : parseThreshold(x.threshold) === null;
  })) errors.criteria = "Cada criterio necesita un umbral numérico (por ejemplo 1,25), o un factor mayor que 0 delante del parámetro.";
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
  /** Why there is no value (the KPI's own note, or the parameter missing), when there is none. */
  note: string | null;
  /** The threshold applied: the criterion's number, or factor × the parameter's value (null when it has none). */
  limit: number | null;
  /** The parameter behind the threshold, with its value for this case (null for a plain number). */
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

/**
 * Compares each criterion with the case's KPI of its period, against its number or factor × its parameter's value for
 * this case. Missing figures (a KPI, a per-case value, a deleted parameter) are «sin datos», never a pass or a fail.
 */
export function evaluatePolicy(criteria: PolicyCriterion[], k: PolicyInputs, parameters: readonly ResolvedParameter[] = []): PolicyResult {
  const results = criteria.map((c): CriterionResult => {
    const unit = metricUnit(c.metric);
    const p = c.parameter ? parameters.find((x) => x.id === c.parameter!.id) ?? null : null;
    const parameter = p && c.parameter ? { ...p, factor: c.parameter.factor } : null;
    const limit = c.parameter ? (p && p.unit === unit && p.value !== null ? c.parameter.factor * p.value : null) : c.threshold;
    const limitNote = !c.parameter
      ? null
      : !p
        ? "El parámetro de este criterio ya no existe."
        : p.unit !== unit
          ? `«${p.name}» no está en la unidad del indicador.`
          : p.value === null
            ? `Falta «${p.name}» en este caso.`
            : null;
    let source: CriterionResult["source"] = null;
    let kpi: Kpi | undefined;
    if (isBankMetric(c.metric)) {
      kpi = k.bank?.kpis.find((x) => x.key === c.metric);
      source = kpi ? "bank" : null;
    } else {
      const pickFrom = (p: "closed" | "ytd") => k[p].find((x) => x.key === c.metric);
      const order: ("closed" | "ytd")[] = c.period === "closed" ? ["closed"] : c.period === "ytd" ? ["ytd"] : k.closed.length ? ["closed"] : ["ytd"];
      for (const p of order) {
        kpi = pickFrom(p);
        if (kpi) {
          source = p;
          break;
        }
      }
    }
    const value = kpi?.value ?? null;
    if (value === null || !Number.isFinite(value)) {
      return { criterion: c, unit, value: null, status: "no_data", source: kpi ? source : null, note: limitNote ?? kpi?.note ?? null, limit, parameter };
    }
    if (limit === null) return { criterion: c, unit, value, status: "no_data", source, note: limitNote, limit, parameter };
    return { criterion: c, unit, value, status: meets(value, c.op, limit) ? "met" : "not_met", source, note: null, limit, parameter };
  });
  const met = results.filter((r) => r.status === "met").length;
  const notMet = results.filter((r) => r.status === "not_met").length;
  const noData = results.filter((r) => r.status === "no_data").length;
  const outcome: PolicyOutcome = notMet > 0 ? "outside" : noData > 0 ? "incomplete" : "within";
  return { outcome, results, met, notMet, noData };
}

/** Per-case parameters the criteria use that this case has no value for, once each (the «Política» panel asks for them). */
export function missingCaseParameters(criteria: readonly PolicyCriterion[], parameters: readonly ResolvedParameter[]): ResolvedParameter[] {
  return criteriaParameterIds(criteria).flatMap((id) => parameters.filter((p) => p.id === id && p.scope === "case" && p.value === null));
}

/** Metrics where less is better (debt, days, returns…): a new criterion on them starts as «como máximo». */
const LOWER_IS_BETTER = new Set<PolicyMetric>([
  "netDebtToEbitda", "debtToEbitda", "debtToEquity", "liabilitiesToEquity", "financialDebt", "netDebt", "dso", "dio", "ccc",
  "netBurn", "inflowVolatility", "debtServiceBurden", "returnedItems", "overdraftDays", "returnedReceiptsRatio",
]);
export const defaultOp = (m: PolicyMetric): PolicyOp => (LOWER_IS_BETTER.has(m) ? "lte" : "gte");

/** A threshold as the form shows it: Spanish decimals, no grouping ("1,25", "-50000"). */
export const thresholdText = (n: number) => String(n).replace(".", ",");
