/**
 * Process templates ("Plantillas"): a named set of document choices and, optionally, a case-view layout. Pure.
 * Stored in case_templates (migration 0019); requirements as [{ kind, level, maxAgeDays }]. Choosing a template in
 * the new-case form fills the same `req_<kind>` / `age_<kind>` fields the form posts, so the analyst can still change
 * them; the case keeps its own copy of the documents.
 */
import { z } from "zod";
import { PRODUCTS } from "../../content/products.es.ts";
import { parseRequirementFields, type NewCase } from "./new-case.ts";
import { REQUIREMENT_KINDS, REQUIREMENT_SPECS, type RequirementKind } from "./requirements.ts";

export type TemplateLevel = "required" | "optional" | "lender";

export interface TemplateRequirement {
  kind: RequirementKind;
  level: TemplateLevel;
  maxAgeDays: number | null;
}

export interface CaseTemplate {
  id: string;
  name: string;
  description: string | null;
  product: string | null;
  requirements: TemplateRequirement[];
  /** Raw stored layout (normalise before drawing), or null to use the team's. */
  layout: unknown;
}

/** Requirements as the case form parses them → as a template stores them. */
export const toTemplateRequirements = (reqs: NewCase["requirements"]): TemplateRequirement[] =>
  reqs.map((r) => ({ kind: r.kind, level: r.source === "lender" ? "lender" : r.required ? "required" : "optional", maxAgeDays: r.maxAgeDays }));

const Stored = z.array(z.object({ kind: z.string(), level: z.string(), maxAgeDays: z.number().nullable().optional() }).passthrough());

/** Any stored requirements → valid ones: known kinds once each, known levels, a max age only where it applies. */
export function normalizeTemplateRequirements(raw: unknown): TemplateRequirement[] {
  const parsed = Stored.safeParse(raw);
  if (!parsed.success) return [];
  const out: TemplateRequirement[] = [];
  for (const r of parsed.data) {
    if (!(REQUIREMENT_KINDS as readonly string[]).includes(r.kind) || out.some((o) => o.kind === r.kind)) continue;
    if (!["required", "optional", "lender"].includes(r.level)) continue;
    const spec = REQUIREMENT_SPECS.find((s) => s.kind === r.kind)!;
    const age = r.maxAgeDays ?? null;
    out.push({ kind: r.kind as RequirementKind, level: r.level as TemplateLevel, maxAgeDays: spec.supportsMaxAge && age && Number.isInteger(age) && age >= 1 && age <= 3650 ? age : null });
  }
  return out.sort((a, b) => REQUIREMENT_KINDS.indexOf(a.kind) - REQUIREMENT_KINDS.indexOf(b.kind));
}

/** The form fields a template fills: every document's choice ("none" when not in the template) and its max age. */
export function templateFormValues(reqs: TemplateRequirement[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const kind of REQUIREMENT_KINDS) {
    const r = reqs.find((x) => x.kind === kind);
    v[`req_${kind}`] = r?.level ?? "none";
    const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
    if (spec.supportsMaxAge) v[`age_${kind}`] = r?.maxAgeDays?.toString() ?? spec.defaultMaxAgeDays?.toString() ?? "";
  }
  return v;
}

export type TemplateFieldErrors = Partial<Record<"name" | "description" | "product" | "requirements", string>>;

const productValues: string[] = PRODUCTS.map((p) => p.value);

/** The template form: name, description, optional default product, the document choices. */
export function parseTemplateForm(values: Record<string, string | undefined>):
  | { ok: true; data: { name: string; description: string | null; product: string | null; requirements: TemplateRequirement[] } }
  | { ok: false; errors: TemplateFieldErrors } {
  const errors: TemplateFieldErrors = {};
  const name = (values.name ?? "").trim();
  if (name.length < 2 || name.length > 80) errors.name = "Ponle un nombre de entre 2 y 80 caracteres.";
  const description = (values.description ?? "").trim();
  if (description.length > 300) errors.description = "La descripción admite hasta 300 caracteres.";
  const product = (values.product ?? "").trim();
  if (product && !productValues.includes(product)) errors.product = "Elige un producto de la lista.";
  const req = parseRequirementFields(values);
  if (req.error) errors.requirements = req.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, description: description || null, product: product || null, requirements: toTemplateRequirements(req.requirements) } };
}

/** One line for lists: "6 documentos · 2 los subes tú". */
export function templateSummary(reqs: TemplateRequirement[]): string {
  const mine = reqs.filter((r) => r.level === "lender").length;
  return `${reqs.length} ${reqs.length === 1 ? "documento" : "documentos"}${mine ? ` · ${mine} ${mine === 1 ? "lo subes" : "los subes"} tú` : ""}`;
}
