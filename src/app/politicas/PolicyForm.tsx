"use client";

/**
 * Name, description and criteria of a credit policy. Each criterion: a KPI, «como mínimo» / «como máximo», a threshold
 * in the KPI's unit — a number, a factor × another KPI in that unit, or a factor × a parameter the analyst enters on
 * each case — and, for the books, which period both KPIs read. The criteria go to the action as JSON (another KPI as
 * against_metric + factor, a parameter as parameter_id + factor).
 */
import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, fieldClass } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { KPI_LABEL, KPI_TILE_GROUP_LABEL } from "@/content/case-view.es";
import { OP_LABEL, POLICY_PERIOD_HINT, POLICY_PERIOD_LABEL, THRESHOLD_GROUP_LABEL, UNIT_TEXT } from "@/content/policies.es";
import type { PolicyParameter } from "@/lib/policies/parameters";
import { cx } from "@/components/ui/cx";
import {
  MAX_CRITERIA, POLICY_METRICS, POLICY_METRIC_GROUPS, defaultOp, isBankMetric, metricUnit, normalizeCriteria, thresholdText,
  type PolicyMetric, type PolicyOp, type PolicyPeriod,
} from "@/lib/policies/policy";
import { savePolicy, type PolicyFormState } from "./actions";

interface Row {
  key: number;
  metric: PolicyMetric;
  op: PolicyOp;
  /** The threshold, or the factor in front of the other KPI or the parameter. */
  threshold: string;
  period: PolicyPeriod;
  /** What the threshold is: "" a plain number, "kpi:<metric>" another KPI, "param:<id>" a case parameter. */
  ref: string;
}

/** What the editor needs of a parameter. */
export type ParameterOption = Pick<PolicyParameter, "id" | "name" | "unit">;

/** Whether a threshold choice still fits a KPI (same unit, another KPI than itself, a parameter that exists). */
const fits = (ref: string, metric: PolicyMetric, parameters: ParameterOption[]) =>
  ref === "" ||
  (ref.startsWith("kpi:") && ref.slice(4) !== metric && (POLICY_METRICS as readonly string[]).includes(ref.slice(4)) && metricUnit(ref.slice(4) as PolicyMetric) === metricUnit(metric)) ||
  (ref.startsWith("param:") && parameters.some((p) => p.id === ref.slice(6) && p.unit === metricUnit(metric)));

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
    const x = (r ?? {}) as { threshold?: unknown; parameter_id?: unknown; against_metric?: unknown; factor?: unknown };
    const ref = typeof x.against_metric === "string" && x.against_metric ? `kpi:${x.against_metric}` : typeof x.parameter_id === "string" && x.parameter_id ? `param:${x.parameter_id}` : "";
    const t = ref ? x.factor : x.threshold;
    // Validated with placeholders: an empty or mistyped threshold or factor stays on screen to be fixed.
    const [c] = normalizeCriteria([{ ...(r as object), threshold: 0, parameter_id: undefined, against_metric: undefined }]);
    return c ? [{ key: i, metric: c.metric, op: c.op, period: c.period, ref, threshold: typeof t === "number" ? thresholdText(t) : typeof t === "string" ? t : "" }] : [];
  });
}

export function PolicyForm({ id, initial, canEdit, parameters = [] }: { id: string | null; initial: Record<string, string>; canEdit: boolean; parameters?: ParameterOption[] }) {
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(savePolicy.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : state.values;
  const errors = state.status === "invalid" ? state.errors : {};
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialRows(values.criteria);
    return r.length ? r : [{ key: 0, metric: "dscr", op: "gte", threshold: "", period: "base", ref: "" }];
  });
  const [nextKey, setNextKey] = useState(rows.length + 1);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, metric: "currentRatio", op: defaultOp("currentRatio"), threshold: "", period: "base", ref: "" }]);
    setNextKey((k) => k + 1);
  };
  const criteriaJson = JSON.stringify(
    rows.map(({ metric, op, threshold, period, ref }) =>
      ref.startsWith("kpi:") ? { metric, op, period, against_metric: ref.slice(4), factor: threshold }
      : ref.startsWith("param:") ? { metric, op, period, parameter_id: ref.slice(6), factor: threshold }
      : { metric, op, period, threshold },
    ),
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
              // Other KPIs and parameters in the KPI's unit; a choice that no longer fits stays listed so it can be changed.
              const kpis = POLICY_METRIC_GROUPS.map((g) => ({ ...g, metrics: g.metrics.filter((m) => m !== r.metric && metricUnit(m) === metricUnit(r.metric)) }));
              const usable = parameters.filter((p) => p.unit === metricUnit(r.metric));
              const viaRef = r.ref !== "";
              const stale = viaRef && !fits(r.ref, r.metric, parameters);
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
                        // Another KPI or a parameter in a different unit no longer fits: back to a plain number.
                        const keep = fits(r.ref, metric, parameters);
                        update(r.key, { metric, op: defaultOp(metric), ...(keep ? {} : { ref: "", threshold: "" }) });
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
                      <label className="sr-only" htmlFor={`threshold-${r.key}`}>{viaRef ? `Factor del criterio ${i + 1}` : `Umbral del criterio ${i + 1}${unit ? ` (${unit})` : ""}`}</label>
                      <input
                        id={`threshold-${r.key}`}
                        inputMode="decimal"
                        value={r.threshold}
                        onChange={(e) => update(r.key, { threshold: e.target.value })}
                        placeholder={viaRef ? "1" : "1,25"}
                        className={cx(fieldClass, viaRef ? "w-20! bg-surface font-mono tabular-nums" : "w-36! bg-surface font-mono tabular-nums")}
                      />
                      {/* «2 × EBITDA»: the factor multiplies the KPI or parameter chosen next. */}
                      {viaRef && <span aria-hidden className="px-0.5 text-[22px] font-medium leading-none text-ink">×</span>}
                      <label className="sr-only" htmlFor={`ref-${r.key}`}>Comparar con un número, otro indicador o un parámetro, criterio {i + 1}</label>
                      <Select
                        id={`ref-${r.key}`}
                        value={r.ref}
                        onChange={(e) => update(r.key, { ref: e.target.value, threshold: e.target.value && !r.ref ? "1" : !e.target.value && r.ref ? "" : r.threshold })}
                        className="w-auto! min-w-0 max-w-full bg-surface"
                      >
                        <option value="">{unit ? `${unit} (valor fijo)` : "Valor fijo"}</option>
                        {kpis.some((g) => g.metrics.length) && (
                          <optgroup label={THRESHOLD_GROUP_LABEL.kpi}>
                            {kpis.flatMap((g) => g.metrics).map((m) => <option key={m} value={`kpi:${m}`}>{KPI_LABEL[m] ?? m}</option>)}
                          </optgroup>
                        )}
                        {usable.length > 0 && (
                          <optgroup label={THRESHOLD_GROUP_LABEL.parameter}>
                            {usable.map((p) => <option key={p.id} value={`param:${p.id}`}>{p.name}</option>)}
                          </optgroup>
                        )}
                        {stale && <option value={r.ref}>{r.ref.startsWith("param:") ? "Parámetro eliminado" : "Indicador en otra unidad"}</option>}
                      </Select>
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
