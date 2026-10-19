/**
 * Policy parameters («Políticas» → «Parámetros», migration 0031): named values a policy criterion compares a KPI with
 * (KPI ≥/≤ factor × parameter). Pure.
 *
 * - fixed: one value for the whole lender («DSCR mínimo» = 1,25x).
 * - case: entered for each case («Importe solicitado»), at creation or later from the case's «Política» panel; a case
 *   without it leaves the criteria that use it «sin datos».
 * The unit is one of the KPIs' units; a criterion can only use a parameter in its KPI's unit. Unit and scope are fixed
 * at creation. Every resolved value carries a source_ref: `param:<id>` (fixed) or `case_param:<case>:<id>` (per case).
 */
import type { Kpi } from "../kpis/engine.ts";
import { parseThreshold } from "./policy.ts";

export type ParameterUnit = Kpi["unit"];
export type ParameterScope = "fixed" | "case";
export const PARAMETER_UNITS: readonly ParameterUnit[] = ["EUR", "x", "%", "days", "count"];

export interface PolicyParameter {
  id: string;
  name: string;
  description: string | null;
  unit: ParameterUnit;
  scope: ParameterScope;
  /** Fixed parameters only. */
  value: number | null;
}

/** A parameter with its value for one case (fixed: the lender's value; per case: the case's, or null if not entered). */
export interface ResolvedParameter {
  id: string;
  name: string;
  unit: ParameterUnit;
  scope: ParameterScope;
  value: number | null;
  sourceRef: string | null;
}

const isUnit = (u: unknown): u is ParameterUnit => (PARAMETER_UNITS as readonly unknown[]).includes(u);
const ID = /^[0-9a-f-]{36}$/i;
export const isParameterId = (id: unknown): id is string => typeof id === "string" && ID.test(id);

/** A stored row → a parameter, or null when it is not one (unknown unit or scope). */
export function toParameter(r: { id: string; name: string; description?: string | null; unit: string; scope: string; value: unknown }): PolicyParameter | null {
  if (!isUnit(r.unit) || (r.scope !== "fixed" && r.scope !== "case")) return null;
  const value = r.value === null || r.value === undefined ? null : Number(r.value);
  return { id: r.id, name: r.name, description: r.description ?? null, unit: r.unit, scope: r.scope, value: value !== null && Number.isFinite(value) ? value : null };
}

/** Every parameter of the lender with its value for one case. */
export function resolveParameters(params: readonly PolicyParameter[], caseId: string | null, caseValues: readonly { parameterId: string; value: number }[]): ResolvedParameter[] {
  return params.map((p) => {
    if (p.scope === "fixed") return { id: p.id, name: p.name, unit: p.unit, scope: p.scope, value: p.value, sourceRef: p.value === null ? null : `param:${p.id}` };
    const v = caseValues.find((x) => x.parameterId === p.id);
    return { id: p.id, name: p.name, unit: p.unit, scope: p.scope, value: v ? v.value : null, sourceRef: v && caseId ? `case_param:${caseId}:${p.id}` : null };
  });
}

export type ParameterFieldErrors = Partial<Record<"name" | "description" | "unit" | "scope" | "value", string>>;

/**
 * The parameter form: name, description, unit, scope and, for a fixed one, its value. On edit (`existing`), unit and
 * scope come from the stored parameter whatever was posted.
 */
export function parseParameterForm(v: Record<string, string | undefined>, existing?: Pick<PolicyParameter, "unit" | "scope"> | null):
  | { ok: true; data: { name: string; description: string | null; unit: ParameterUnit; scope: ParameterScope; value: number | null } }
  | { ok: false; errors: ParameterFieldErrors } {
  const errors: ParameterFieldErrors = {};
  const name = (v.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Pon un nombre de al menos 2 caracteres.";
  else if (name.length > 60) errors.name = "Máximo 60 caracteres.";
  const description = (v.description ?? "").trim();
  if (description.length > 300) errors.description = "Máximo 300 caracteres.";
  const unit = existing?.unit ?? v.unit;
  if (!isUnit(unit)) errors.unit = "Elige la unidad.";
  const scope = existing?.scope ?? v.scope;
  if (scope !== "fixed" && scope !== "case") errors.scope = "Elige si es fijo o se introduce en cada caso.";
  let value: number | null = null;
  if (scope === "fixed") {
    value = parseThreshold(v.value ?? "");
    if (value === null) errors.value = "Escribe el valor (por ejemplo 1,25).";
    else if (Math.abs(value) >= 1e15) errors.value = "El valor es demasiado alto.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, description: description || null, unit: unit as ParameterUnit, scope: scope as ParameterScope, value } };
}

/**
 * Per-case values posted as `param_<id>` (new-case form, «Política» panel). Only the lender's per-case parameters are
 * read; `required` ones must have a value. An empty field is «no value» (on the panel: remove it).
 */
export function parseCaseParameterFields(values: Record<string, string | undefined>, params: readonly PolicyParameter[], required: ReadonlySet<string> = new Set()):
  | { ok: true; values: { parameterId: string; value: number | null }[] }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const out: { parameterId: string; value: number | null }[] = [];
  for (const p of params) {
    if (p.scope !== "case") continue;
    const key = `param_${p.id}`;
    if (!(key in values) && !required.has(p.id)) continue;
    const raw = (values[key] ?? "").trim();
    if (!raw) {
      if (required.has(p.id)) errors[key] = `Indica «${p.name}»: lo pide la política de la plantilla.`;
      else out.push({ parameterId: p.id, value: null });
      continue;
    }
    const n = parseThreshold(raw);
    if (n === null) errors[key] = `«${p.name}» debe ser un número (por ejemplo 250.000).`;
    else if (Math.abs(n) >= 1e15) errors[key] = `«${p.name}» es demasiado alto.`;
    else out.push({ parameterId: p.id, value: n });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: out };
}

/** A value as the form shows it: Spanish decimals, no grouping. */
export const parameterValueText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
