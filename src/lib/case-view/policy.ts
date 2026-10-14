/**
 * The credit policy applied to a case, evaluated against its KPIs, for the case view, the PDF and the exports. Pure.
 * Informational: the thresholds are the lender's; credIA compares, it does not decide.
 */
import { KPI_LABEL } from "../../content/case-view.es.ts";
import { OP_SYMBOL, OUTCOME_LABEL, POLICY_PERIOD_LABEL, SOURCE_LABEL, STATUS_LABEL, outcomeSentence } from "../../content/policies.es.ts";
import { formatFigure } from "../format.ts";
import type { Kpi } from "../kpis/engine.ts";
import { evaluatePolicy, type CriterionResult, type PolicyResult } from "../policies/policy.ts";
import type { CaseViewData } from "./load.ts";

export interface PolicyView {
  id: string;
  name: string;
  description: string | null;
  result: PolicyResult;
  /** «Según vuestra política …»: what the lender's thresholds would suggest. */
  sentence: string;
}

export function policyView(d: Pick<CaseViewData, "policy" | "kpis" | "bank">): PolicyView | null {
  if (!d.policy) return null;
  const result = evaluatePolicy(d.policy.criteria, { closed: d.kpis.closed, ytd: d.kpis.ytd, bank: d.bank });
  return { id: d.policy.id, name: d.policy.name, description: d.policy.description, result, sentence: outcomeSentence(result.outcome, d.policy.name, result) };
}

/** A policy figure in Spanish with its unit: thresholds with the decimals they were written with, values as the KPI tiles. */
export function policyFigure(v: number | null, unit: Kpi["unit"], exact = false): string {
  if (v === null) return "—";
  const decimals = exact ? Math.min(2, (String(v).split(".")[1] ?? "").length) : unit === "x" ? 2 : unit === "%" ? (Number.isInteger(v) ? 0 : 1) : undefined;
  const f = formatFigure(v, unit, decimals);
  return unit === "x" ? `${f.number}x` : f.unit ? `${f.number} ${f.unit}` : f.number;
}

/** One criterion, worded for the PDF and Excel: label, condition, where the figure comes from, status. */
export function criterionLine(r: CriterionResult) {
  const c = r.criterion;
  return {
    label: KPI_LABEL[c.metric] ?? c.metric,
    condition: `${OP_SYMBOL[c.op]} ${policyFigure(c.threshold, r.unit, true)}`,
    value: policyFigure(r.value, r.unit),
    source: r.source ? SOURCE_LABEL[r.source] : c.period !== "base" ? POLICY_PERIOD_LABEL[c.period] : "",
    status: STATUS_LABEL[r.status],
  };
}

export { OUTCOME_LABEL };
