"use client";

/**
 * Name, description and criteria of a credit policy. Each criterion: a KPI, «como mínimo» / «como máximo», a threshold
 * in the KPI's unit and, for the books, which period it reads. The criteria go to the action as JSON.
 */
import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, fieldClass } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { KPI_LABEL, KPI_TILE_GROUP_LABEL } from "@/content/case-view.es";
import { OP_LABEL, POLICY_PERIOD_HINT, POLICY_PERIOD_LABEL } from "@/content/policies.es";
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
  threshold: string;
  period: PolicyPeriod;
}

const UNIT_TEXT = { EUR: "€", x: "x", "%": "%", days: "días", count: "" } as const;

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
    const t = (r as { threshold?: unknown } | null)?.threshold;
    // Validated with a placeholder threshold: an empty or mistyped one stays on screen to be fixed.
    const [c] = normalizeCriteria([{ ...(r as object), threshold: 0 }]);
    return c ? [{ key: i, metric: c.metric, op: c.op, period: c.period, threshold: typeof t === "number" ? thresholdText(t) : typeof t === "string" ? t : "" }] : [];
  });
}

export function PolicyForm({ id, initial, canEdit }: { id: string | null; initial: Record<string, string>; canEdit: boolean }) {
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(savePolicy.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : state.values;
  const errors = state.status === "invalid" ? state.errors : {};
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialRows(values.criteria);
    return r.length ? r : [{ key: 0, metric: "dscr", op: "gte", threshold: "", period: "base" }];
  });
  const [nextKey, setNextKey] = useState(rows.length + 1);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, metric: "currentRatio", op: defaultOp("currentRatio"), threshold: "", period: "base" }]);
    setNextKey((k) => k + 1);
  };
  const criteriaJson = JSON.stringify(rows.map(({ metric, op, threshold, period }) => ({ metric, op, threshold, period })));

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
              return (
                <li key={r.key} className="flex flex-col gap-2 rounded-row bg-soft p-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="sr-only" htmlFor={`metric-${r.key}`}>Indicador del criterio {i + 1}</label>
                  <Select
                    id={`metric-${r.key}`}
                    value={r.metric}
                    onChange={(e) => {
                      const metric = e.target.value as PolicyMetric;
                      update(r.key, { metric, op: defaultOp(metric) });
                    }}
                    className="bg-surface sm:w-64 sm:grow"
                  >
                    {POLICY_METRIC_GROUPS.map((g) => (
                      <optgroup key={g.id} label={KPI_TILE_GROUP_LABEL[g.id]}>
                        {g.metrics.map((m) => <option key={m} value={m}>{KPI_LABEL[m] ?? m}</option>)}
                      </optgroup>
                    ))}
                  </Select>
                  <label className="sr-only" htmlFor={`op-${r.key}`}>Condición del criterio {i + 1}</label>
                  <Select id={`op-${r.key}`} value={r.op} onChange={(e) => update(r.key, { op: e.target.value as PolicyOp })} className="bg-surface sm:w-40">
                    {(["gte", "lte"] as const).map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                  </Select>
                  <span className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`threshold-${r.key}`}>Umbral del criterio {i + 1}{unit ? ` (${unit})` : ""}</label>
                    <input
                      id={`threshold-${r.key}`}
                      inputMode="decimal"
                      value={r.threshold}
                      onChange={(e) => update(r.key, { threshold: e.target.value })}
                      placeholder="1,25"
                      className={cx(fieldClass, "w-32 bg-surface font-mono tabular-nums")}
                    />
                    <span className="w-9 text-[13px] text-muted">{unit}</span>
                  </span>
                  {bank ? (
                    <span className="text-[13px] text-muted sm:w-40">Últimos 12 meses</span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`period-${r.key}`}>Periodo del criterio {i + 1}</label>
                      <Select id={`period-${r.key}`} value={r.period} onChange={(e) => update(r.key, { period: e.target.value as PolicyPeriod })} className="bg-surface sm:w-44">
                        {(["base", "closed", "ytd"] as const).map((p) => <option key={p} value={p}>{POLICY_PERIOD_LABEL[p]}</option>)}
                      </Select>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    disabled={rows.length === 1}
                    className="flex size-11 items-center justify-center self-end rounded-full text-muted transition-colors duration-150 hover:bg-soft-control hover:text-ink disabled:opacity-40 sm:self-auto"
                  >
                    <X size={18} strokeWidth={2} aria-hidden />
                    <span className="sr-only">Quitar el criterio {i + 1}</span>
                  </button>
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
