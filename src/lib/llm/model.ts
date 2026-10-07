/** Shared Claude request options. Model ids come from env; features are only sent to models that accept them. */

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
/** Models that accept `output_config.effort`. */
const EFFORT_MODELS = /^claude-(fable|mythos|opus-(5|4-[5-8])|sonnet-(5|4-6))/;

export type Effort = "low" | "medium" | "high";

export function modelFor(purpose: "assistant" | "analyst" | "extraction"): string {
  const v =
    purpose === "assistant" ? process.env.CREDIA_ASSISTANT_MODEL
    : purpose === "analyst" ? process.env.CREDIA_ANALYST_MODEL
    : process.env.CREDIA_EXTRACTION_MODEL;
  return v || DEFAULT_MODEL;
}

export const supportsEffort = (model: string) => EFFORT_MODELS.test(model);

/** Beta params for the server-side refusal fallback, when the model supports it. */
export function fallbackParams(model: string): { betas?: string[]; fallbacks?: "default" } {
  return FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}
