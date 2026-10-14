"use client";

/**
 * «Política» under the case's «Indicadores»: apply one of the lender's credit policies and see, criterion by
 * criterion, whether the case's KPIs fall inside its thresholds. Informational: the thresholds are the lender's and
 * the outcome is worded as what their policy would suggest, never as credIA's decision.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { applyCasePolicy } from "@/app/casos/policy-actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Figure } from "@/components/ui/Figure";
import { Select } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { SeverityDot, type Tone } from "@/components/ui/SeverityDot";
import { KPI_LABEL } from "@/content/case-view.es";
import { OP_SYMBOL, OUTCOME_LABEL, POLICY_NOTE, POLICY_PERIOD_LABEL, SOURCE_LABEL, STATUS_LABEL, outcomeSentence } from "@/content/policies.es";
import type { CriterionStatus, PolicyOutcome, PolicyResult } from "@/lib/policies/policy";

export interface CasePolicyView {
  /** The lender's policies, to choose from. */
  options: { id: string; name: string }[];
  /** The policy applied to this case and its result, or null. */
  applied: { id: string; name: string; result: PolicyResult } | null;
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
                      {OP_SYMBOL[c.op]} <Figure value={c.threshold} unit={r.unit} decimals={decimals(r.unit, c.threshold, true)} />
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
    </section>
  );
}
