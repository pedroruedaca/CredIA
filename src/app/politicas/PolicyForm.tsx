"use client";

/**
 * Name, description and criteria of a credit policy. Each criterion: a KPI, «como mínimo» / «como máximo», a threshold
 * in the KPI's unit — a number, or a factor × one of the lender's parameters in that unit — and, for the books, which
 * period it reads. The criteria go to the action as JSON (a parameter as parameter_id + factor).
 */
import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, fieldClass } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { KPI_LABEL, KPI_TILE_GROUP_LABEL } from "@/content/case-view.es";
import { OP_LABEL, PARAMETER_SCOPE_LABEL, POLICY_PERIOD_HINT, POLICY_PERIOD_LABEL, UNIT_TEXT } from "@/content/policies.es";
import type { PolicyParameter } from "@/lib/policies/parameters";
import { cx } from "@/components/ui/cx";
import {
  MAX_CRITERIA, POLICY_METRIC_GROUPS, defaultOp, isBankMetric, metricUnit, normalizeCriteria, thresholdText,
  type PolicyMetric, type PolicyOp, type PolicyPeriod,
} from "@/lib/policies/policy";
import { savePolicy, type PolicyFormState } from "./actions";

interface Row {
  key: number;
  metric: PolicyMetric;
  op: PolicyOp;
  /** The threshold, or the factor in front of the parameter when there is one. */
  threshold: string;
  period: PolicyPeriod;
  /** "" = a plain number. */
  parameterId: string;
}

/** What the editor needs of a parameter. */
export type ParameterOption = Pick<PolicyParameter, "id" | "name" | "unit" | "scope">;

/** Rows from the posted JSON, thresholds kept as typed (the form comes back with them when something is wrong). */
function initialRows(json: string | undefined): Row[] {
  let raw: unknown = [];
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CRITERIA).flatMap((r, i) => {
    const x = (r ?? {}) as { threshold?: unknown; parameter_id?: unknown; factor?: unknown };
    const parameterId = typeof x.parameter_id === "string" ? x.parameter_id : "";
    const t = parameterId ? x.factor : x.threshold;
    // Validated with placeholders: an empty or mistyped threshold or factor stays on screen to be fixed.
    const [c] = normalizeCriteria([{ ...(r as object), threshold: 0, parameter_id: undefined }]);
    return c ? [{ key: i, metric: c.metric, op: c.op, period: c.period, parameterId, threshold: typeof t === "number" ? thresholdText(t) : typeof t === "string" ? t : "" }] : [];
  });
}

export function PolicyForm({ id, initial, canEdit, parameters = [] }: { id: string | null; initial: Record<string, string>; canEdit: boolean; parameters?: ParameterOption[] }) {
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(savePolicy.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : state.values;
  const errors = state.status === "invalid" ? state.errors : {};
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialRows(values.criteria);
    return r.length ? r : [{ key: 0, metric: "dscr", op: "gte", threshold: "", period: "base", parameterId: "" }];
  });
  const [nextKey, setNextKey] = useState(rows.length + 1);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, metric: "currentRatio", op: defaultOp("currentRatio"), threshold: "", period: "base", parameterId: "" }]);
    setNextKey((k) => k + 1);
  };
  const criteriaJson = JSON.stringify(
    rows.map(({ metric, op, threshold, period, parameterId }) => (parameterId ? { metric, op, period, parameter_id: parameterId, factor: threshold } : { metric, op, period, threshold })),
  );

  return (
    <form action={action} className="flex flex-col gap-10" noValidate>
      {state.status === "failed" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      {state.status === "invalid" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Revisa</Pill>Revisa los campos marcados.</p>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-10">
        <section className="flex flex-col gap-5">
          <Field id="name" label="Nombre" hint="Por ejemplo: Factoring pyme, Circulante hasta 250.000 €." error={errors.name}>
            <Input id="name" name="name" required defaultValue={values.name ?? ""} maxLength={80} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <Field id="description" label="Descripción (opcional)" error={errors.description}>
            <Textarea id="description" name="description" rows={2} maxLength={300} defaultValue={values.description ?? ""} />
          </Field>
        </section>

        <fieldset className="flex flex-col gap-3">
          <legend className="heading-section mb-1">Criterios</legend>
          <p className="text-[15px] text-ink-2">Un caso queda dentro de la política cuando cumple todos. {POLICY_PERIOD_HINT}</p>
          {errors.criteria && <p className="text-[13px] text-high">{errors.criteria}</p>}
          <input type="hidden" name="criteria" value={criteriaJson} />
          <ul aria-label="Criterios" className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const unit = UNIT_TEXT[metricUnit(r.metric)];
              const bank = isBankMetric(r.metric);
              // Parameters in the KPI's unit; one no longer listed (deleted, other unit) stays selectable to be changed.
              const usable = parameters.filter((p) => p.unit === metricUnit(r.metric) || p.id === r.parameterId);
              const viaParameter = r.parameterId !== "";
              const gone = viaParameter && !parameters.some((p) => p.id === r.parameterId);
              return (
                <li key={r.key} className="flex flex-col gap-2 rounded-row bg-soft p-3">
                  {/* Line 1: the KPI, and removing the criterion. */}
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`metric-${r.key}`}>Indicador del criterio {i + 1}</label>
                    <Select
                      id={`metric-${r.key}`}
                      value={r.metric}
                      onChange={(e) => {
                        const metric = e.target.value as PolicyMetric;
                        // A parameter in another unit no longer fits: back to a plain number.
                        const keep = parameters.some((p) => p.id === r.parameterId && p.unit === metricUnit(metric));
                        update(r.key, { metric, op: defaultOp(metric), ...(keep ? {} : { parameterId: "", threshold: r.parameterId ? "" : r.threshold }) });
                      }}
                      className="min-w-0 grow bg-surface"
                    >
                      {POLICY_METRIC_GROUPS.map((g) => (
                        <optgroup key={g.id} label={KPI_TILE_GROUP_LABEL[g.id]}>
                          {g.metrics.map((m) => <option key={m} value={m}>{KPI_LABEL[m] ?? m}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      disabled={rows.length === 1}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-soft-control hover:text-ink disabled:opacity-40"
                    >
                      <X size={18} strokeWidth={2} aria-hidden />
                      <span className="sr-only">Quitar el criterio {i + 1}</span>
                    </button>
                  </div>
                  {/* Line 2: condition, threshold and period; the selects take the width of their longest option. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`op-${r.key}`}>Condición del criterio {i + 1}</label>
                    <Select id={`op-${r.key}`} value={r.op} onChange={(e) => update(r.key, { op: e.target.value as PolicyOp })} className="w-auto! shrink-0 bg-surface">
                      {(["gte", "lte"] as const).map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                    </Select>
                    <span className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`threshold-${r.key}`}>{viaParameter ? `Factor del criterio ${i + 1}` : `Umbral del criterio ${i + 1}${unit ? ` (${unit})` : ""}`}</label>
                      <input
                        id={`threshold-${r.key}`}
                        inputMode="decimal"
                        value={r.threshold}
                        onChange={(e) => update(r.key, { threshold: e.target.value })}
                        placeholder={viaParameter ? "1" : "1,25"}
                        className={cx(fieldClass, viaParameter ? "w-20! bg-surface font-mono tabular-nums" : "w-36! bg-surface font-mono tabular-nums")}
                      />
                      {usable.length > 0 || viaParameter ? (
                        <>
                          <label className="sr-only" htmlFor={`param-${r.key}`}>Un número o un parámetro, criterio {i + 1}</label>
                          <Select
                            id={`param-${r.key}`}
                            value={r.parameterId}
                            onChange={(e) => update(r.key, { parameterId: e.target.value, threshold: e.target.value && !r.parameterId && !r.threshold ? "1" : r.threshold })}
                            className="w-auto! shrink-0 bg-surface"
                          >
                            <option value="">{unit || "número"}</option>
                            {usable.map((p) => <option key={p.id} value={p.id}>× {p.name} ({PARAMETER_SCOPE_LABEL[p.scope].toLowerCase()})</option>)}
                            {gone && <option value={r.parameterId}>× parámetro eliminado</option>}
                          </Select>
                        </>
                      ) : (
                        <span className="min-w-6 text-[13px] text-muted">{unit}</span>
                      )}
                    </span>
                    {bank ? (
                      <span className="text-[13px] text-muted">Últimos 12 meses de extractos</span>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`period-${r.key}`}>Periodo del criterio {i + 1}</label>
                        <Select id={`period-${r.key}`} value={r.period} onChange={(e) => update(r.key, { period: e.target.value as PolicyPeriod })} className="w-auto! shrink-0 bg-surface">
                          {(["base", "closed", "ytd"] as const).map((p) => <option key={p} value={p}>{POLICY_PERIOD_LABEL[p]}</option>)}
                        </Select>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length < MAX_CRITERIA && (
            <Button variant="link" size="sm" onClick={add} className="w-fit">
              <Plus size={16} strokeWidth={2} aria-hidden /> Añadir criterio
            </Button>
          )}
        </fieldset>
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : id ? "Guardar cambios" : "Crear política"}</Button>
          <ButtonLink href="/politicas" variant="secondary">Cancelar</ButtonLink>
        </div>
      )}
    </form>
  );
}
