/** «Políticas» copy (Spanish): the lender's thresholds on the KPIs and the informational outcome in the case view. */
import type { ParameterUnit } from "../lib/policies/parameters.ts";
import type { CriterionStatus, PolicyOp, PolicyOutcome, PolicyPeriod } from "../lib/policies/policy.ts";

export const OP_LABEL: Record<PolicyOp, string> = { gte: "Como mínimo", lte: "Como máximo" };
export const OP_SYMBOL: Record<PolicyOp, string> = { gte: "≥", lte: "≤" };

export const POLICY_PERIOD_LABEL: Record<PolicyPeriod, string> = {
  base: "Periodo base",
  closed: "Ejercicio cerrado",
  ytd: "Año en curso",
};
export const POLICY_PERIOD_HINT = "Periodo base: el ejercicio cerrado si lo hay; si no, el año en curso. Los indicadores bancarios usan los últimos 12 meses de extractos.";

export const SOURCE_LABEL = { closed: "Ejercicio cerrado", ytd: "Año en curso", bank: "Extractos bancarios" } as const;

export const OUTCOME_LABEL: Record<PolicyOutcome, string> = {
  within: "Dentro de la política",
  outside: "Fuera de la política",
  incomplete: "Faltan datos",
};

export const STATUS_LABEL: Record<CriterionStatus, string> = { met: "Cumple", not_met: "No cumple", no_data: "Sin datos" };

/** The sentence under the outcome: what the lender's own thresholds would suggest, never credIA's decision. */
export function outcomeSentence(outcome: PolicyOutcome, name: string, counts: { notMet: number; noData: number }): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (outcome === "within") return `Según vuestra política «${name}», los indicadores de este caso permitirían financiar.`;
  if (outcome === "outside") return `Según vuestra política «${name}», los indicadores de este caso no permitirían financiar: ${plural(counts.notMet, "criterio no se cumple", "criterios no se cumplen")}.`;
  return `Los criterios con datos se cumplen, pero ${plural(counts.noData, "criterio no tiene", "criterios no tienen")} datos en este caso: con vuestra política «${name}» no se puede concluir todavía.`;
}

export const POLICY_NOTE =
  "Informativo. Compara los indicadores del caso con los umbrales que ha fijado vuestra entidad; no es una puntuación ni una decisión de credIA. La decisión es vuestra.";

export const POLICIES_INTRO =
  "Los umbrales de vuestra entidad sobre los indicadores: DSCR mínimo, apalancamiento máximo, días de cobro… Desde el panel del caso aplicas una y ves qué criterios cumplen sus cifras.";

// ------------------------------------------------------------------------------------------------ parameters (0031)

export const PARAMETER_HINT = "El analista lo introduce en cada caso, al crearlo o desde su panel «Política».";
/** Units as the parameter form offers them (the KPIs' units). */
export const PARAMETER_UNIT_LABEL: Record<ParameterUnit, string> = { EUR: "Euros (€)", x: "Veces (x)", "%": "Porcentaje (%)", days: "Días", count: "Número" };
/** Short unit after a figure in forms. */
export const UNIT_TEXT: Record<ParameterUnit, string> = { EUR: "€", x: "x", "%": "%", days: "días", count: "" };

export const PARAMETERS_INTRO =
  "Datos de cada operación que el analista introduce en el caso (importe solicitado, plazo…) y que vuestras políticas comparan con los indicadores: «Ingresos ≥ 4 × Importe solicitado». Los valores fijos van en la propia política.";

/** The threshold selector of a criterion: a number, another KPI or a parameter. */
export const THRESHOLD_GROUP_LABEL = { kpi: "Otro indicador", parameter: "Parámetro del caso" } as const;

export const CASE_PARAMETERS_COPY = {
  title: "Parámetros de este caso",
  missing: (n: number) => (n === 1 ? "Falta un valor que usa la política aplicada." : `Faltan ${n} valores que usa la política aplicada.`),
  usedBy: "Lo usa la política",
  save: "Guardar valores",
  saving: "Guardando…",
  saved: "Guardado",
  empty: "Sin valor",
} as const;
