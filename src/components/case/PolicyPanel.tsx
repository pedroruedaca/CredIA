"use client";

/**
 * «Política» at the top of the case view, above the modules: apply one of the lender's credit policies and see, criterion by
 * criterion, whether the case's KPIs fall inside its thresholds. Informational: the thresholds are the lender's and
 * the outcome is worded as what their policy would suggest, never as credIA's decision. Below the criteria, the case's
 * values of the lender's per-case parameters (0031): the ones the applied policy needs and lacks are marked, and owners
 * and analysts fill or change them here.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { applyCasePolicy, saveCaseParameters } from "@/app/casos/policy-actions";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { fieldClass } from "@/components/ui/Input";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Figure } from "@/components/ui/Figure";
import { Select } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { SeverityDot, type Tone } from "@/components/ui/SeverityDot";
import { KPI_LABEL } from "@/content/case-view.es";
import { CASE_PARAMETERS_COPY, OP_SYMBOL, OUTCOME_LABEL, POLICY_NOTE, POLICY_PERIOD_LABEL, SOURCE_LABEL, STATUS_LABEL, UNIT_TEXT, outcomeSentence } from "@/content/policies.es";
import { parameterValueText, type ResolvedParameter } from "@/lib/policies/parameters";
import type { CriterionResult, CriterionStatus, PolicyOutcome, PolicyResult } from "@/lib/policies/policy";

export interface CasePolicyView {
  /** The lender's policies, to choose from. */
  options: { id: string; name: string }[];
  /** The policy applied to this case and its result, or null. */
  applied: { id: string; name: string; result: PolicyResult } | null;
  /** The lender's per-case parameters with this case's values, and which of them the applied policy uses. */
  caseParameters?: ResolvedParameter[];
  usedParameterIds?: string[];
}

const OUTCOME_TONE: Record<PolicyOutcome, Tone> = { within: "ok", outside: "high", incomplete: "warn" };
const STATUS_TONE: Record<CriterionStatus, Tone> = { met: "ok", not_met: "high", no_data: "neutral" };

/** Two decimals for ratios, one for percentages that have them, as the KPI tiles; thresholds as written. */
const decimals = (unit: string, v: number | null, exact = false) => {
  if (v === null) return undefined;
  if (exact) return Math.min(2, (String(v).split(".")[1] ?? "").length);
  return unit === "x" ? 2 : unit === "%" ? (Number.isInteger(v) ? 0 : 1) : undefined;
};

export function PolicyPanel({ caseId, view, canEdit }: { caseId: string; view: CasePolicyView; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { applied, options } = view;
  if (!applied && !canEdit) return null;

  const choose = (policyId: string) =>
    start(async () => {
      setError(null);
      const r = await applyCasePolicy(caseId, policyId || null);
      if (!r.ok) setError(r.message);
    });

  return (
    <section aria-labelledby="politica" className="flex flex-col gap-3" aria-busy={pending || undefined}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 id="politica" className="text-[15px] font-semibold">Política</h3>
        {applied && <Pill tone={OUTCOME_TONE[applied.result.outcome]}>{OUTCOME_LABEL[applied.result.outcome]}</Pill>}
        <div className="grow" />
        {canEdit && options.length > 0 && (
          <>
            <label htmlFor="case-policy" className="sr-only">Política aplicada</label>
            <Select id="case-policy" value={applied?.id ?? ""} disabled={pending} onChange={(e) => choose(e.target.value)} className="w-auto! min-w-52 max-w-full">
              <option value="">Sin política</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </>
        )}
        <Link href="/politicas" className="inline-flex min-h-11 items-center text-[13px] font-medium">{options.length ? "Gestionar políticas" : "Crear una política"}</Link>
      </div>

      {!applied && (
        <p className="text-[15px] text-ink-2">
          {options.length
            ? "Aplica una política de vuestra entidad para comparar estos indicadores con sus umbrales."
            : "Aún no hay políticas: define los umbrales de vuestra entidad y compáralos con los indicadores de cada caso."}
        </p>
      )}

      {applied && (
        <>
          <p className="max-w-[720px] text-[15px] text-ink-2">{outcomeSentence(applied.result.outcome, applied.name, applied.result)}</p>
          <ul aria-label={`Criterios de «${applied.name}»`} className="flex flex-col">
            {applied.result.results.map((r, i) => {
              const c = r.criterion;
              const where = r.source ? SOURCE_LABEL[r.source] : c.period !== "base" ? POLICY_PERIOD_LABEL[c.period] : null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hairline py-2.5 last:border-b-0">
                  <SeverityDot tone={STATUS_TONE[r.status]} className="size-2" />
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-[15px] font-medium">{KPI_LABEL[c.metric] ?? c.metric}</span>
                    <span className="text-[13px] text-muted">
                      {OP_SYMBOL[c.op]} <Threshold r={r} />
                      {where ? ` · ${where}` : ""}
                      {r.status === "no_data" && r.note ? ` · ${r.note}` : ""}
                    </span>
                  </span>
                  <Figure value={r.value} unit={r.unit} decimals={decimals(r.unit, r.value)} className="text-[17px]" />
                  <span className="w-20 text-right text-[13px] text-ink-2">{STATUS_LABEL[r.status]}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">{POLICY_NOTE}</p>
        </>
      )}
      {error && <ErrorLine message={error} />}
      {(view.caseParameters?.length ?? 0) > 0 && (
        <CaseParameters caseId={caseId} params={view.caseParameters!} used={new Set(applied ? view.usedParameterIds ?? [] : [])} canEdit={canEdit} />
      )}
    </section>
  );
}

/** «≥ 1,25x», «≤ 3 × EBITDA = 547.200 €» from another KPI, or «≥ 4 × Importe solicitado = 1.000.000 €» from a parameter. */
function Threshold({ r }: { r: CriterionResult }) {
  const c = r.criterion;
  const ref = c.against ? { factor: c.against.factor, name: KPI_LABEL[c.against.metric] ?? c.against.metric } : c.parameter ? { factor: c.parameter.factor, name: r.parameter?.name ?? "parámetro eliminado" } : null;
  if (!ref) return <Figure value={c.threshold} unit={r.unit} decimals={decimals(r.unit, c.threshold ?? null, true)} />;
  const factor = ref.factor === 1 ? "" : `${String(ref.factor).replace(".", ",")} × `;
  return (
    <>
      {factor}{ref.name}
      {r.limit !== null && <> = <Figure value={r.limit} unit={r.unit} decimals={decimals(r.unit, r.limit)} /></>}
    </>
  );
}

/** The case's parameter values; those the applied policy uses come first, missing ones marked. */
function CaseParameters({ caseId, params, used, canEdit }: { caseId: string; params: ResolvedParameter[]; used: Set<string>; canEdit: boolean }) {
  const initial = Object.fromEntries(params.map((p) => [`param_${p.id}`, parameterValueText(p.value)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ordered = [...params].sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)) || a.name.localeCompare(b.name, "es"));
  const missing = ordered.filter((p) => used.has(p.id) && p.value === null).length;
  const changed = ordered.some((p) => (values[`param_${p.id}`] ?? "") !== initial[`param_${p.id}`]);

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const r = await saveCaseParameters(caseId, values);
      if (r.ok) setSaved(true);
      else setError(r.message);
    });

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <h4 className="text-[13px] font-semibold">{CASE_PARAMETERS_COPY.title}</h4>
        {missing > 0 && <Pill tone="warn">{CASE_PARAMETERS_COPY.missing(missing)}</Pill>}
        {saved && !changed && <Pill tone="ok">{CASE_PARAMETERS_COPY.saved}</Pill>}
      </div>
      <ul className="flex flex-col">
        {ordered.map((p) => {
          const key = `param_${p.id}`;
          const lacks = used.has(p.id) && p.value === null;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline py-2 last:border-b-0">
              <span className="flex min-w-0 grow flex-col">
                <label htmlFor={`case-${key}`} className="text-[15px]">{p.name}</label>
                {used.has(p.id) && <span className="text-[13px] text-muted">{CASE_PARAMETERS_COPY.usedBy}</span>}
              </span>
              {canEdit ? (
                <span className="flex items-center gap-2">
                  <input
                    id={`case-${key}`}
                    inputMode="decimal"
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={CASE_PARAMETERS_COPY.empty}
                    aria-invalid={lacks || undefined}
                    className={cx(fieldClass, "w-40! font-mono tabular-nums", lacks && "ring-2 ring-warn-dot/50")}
                  />
                  <span className="min-w-8 text-[13px] text-muted">{UNIT_TEXT[p.unit]}</span>
                </span>
              ) : p.value === null ? (
                <span className="text-[13px] text-muted">{CASE_PARAMETERS_COPY.empty}</span>
              ) : (
                <Figure value={p.value} unit={p.unit} className="text-[15px]" />
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && changed && (
        <Button size="sm" onClick={save} disabled={pending} className="w-fit">{pending ? CASE_PARAMETERS_COPY.saving : CASE_PARAMETERS_COPY.save}</Button>
      )}
      {error && <ErrorLine message={error} />}
    </div>
  );
}
