/** Step navigation for the one-step-at-a-time borrower flow. Pure. */
import type { RequirementKind } from "../cases/requirements.ts";
import type { ChecklistItem } from "./checklist.ts";

export const REVIEW = "enviar" as const;
export type StepId = RequirementKind | typeof REVIEW;

type Item = Pick<ChecklistItem, "kind" | "state">;

/** Where to land: the first step needing attention, then the first not done, else the review step. */
export function defaultStep(items: Item[]): StepId {
  return items.find((i) => i.state === "attention")?.kind ?? items.find((i) => i.state !== "done")?.kind ?? REVIEW;
}

/** `?paso=` from the URL if it names a step of this case, otherwise the default. */
export function resolveStep(param: string | string[] | undefined, items: Item[]): StepId {
  const p = Array.isArray(param) ? param[0] : param;
  if (p === REVIEW) return REVIEW;
  return items.some((i) => i.kind === p) ? (p as RequirementKind) : defaultStep(items);
}

/** "Continuar": the next step after this one that isn't done, looping round once; the review step when all are. */
export function nextStep(current: StepId, items: Item[]): StepId {
  if (current === REVIEW) return REVIEW;
  const at = items.findIndex((i) => i.kind === current);
  const ordered = [...items.slice(at + 1), ...items.slice(0, at)];
  return ordered.find((i) => i.state !== "done")?.kind ?? REVIEW;
}

/** 1-based position for "Paso N de M"; the review step is the last one. */
export function stepNumber(current: StepId, items: Item[]): { n: number; of: number } {
  const of = items.length + 1;
  return { n: current === REVIEW ? of : items.findIndex((i) => i.kind === current) + 1, of };
}
