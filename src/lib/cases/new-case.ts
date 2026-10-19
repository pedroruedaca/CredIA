/**
 * Validation for the "Nuevo caso" form. Pure: takes plain form values, returns data or Spanish field errors.
 * No product, amount or term (Oct 2026): what a case is measured against comes from the lender's policy parameters
 * (`param_<id>`, parameters.ts), required when the template's policy uses them.
 */
import { z } from "zod";
import { isValidCif, normalizeCif } from "../cif.ts";
import { parseCaseParameterFields, type PolicyParameter } from "../policies/parameters.ts";
import { REQUIREMENT_KINDS, REQUIREMENT_SPECS, type RequirementKind, type RequirementSource } from "./requirements.ts";

export const newCaseSchema = z.object({
  cif: z
    .string()
    .transform(normalizeCif)
    .refine(isValidCif, "El CIF no es válido. Revisa la letra inicial y el dígito de control."),
  name: z.string().trim().min(2, "Indica la razón social.").max(200),
  fiscalYearEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de cierre del último ejercicio.")
    .refine((d) => !Number.isNaN(Date.parse(d)) && d <= new Date().toISOString().slice(0, 10), "El cierre del último ejercicio no puede estar en el futuro."),
  borrowerEmail: z.string().trim().toLowerCase().email("Indica un correo electrónico válido."),
});

export type NewCase = z.infer<typeof newCaseSchema> & {
  requirements: { kind: RequirementKind; required: boolean; maxAgeDays: number | null; source: RequirementSource }[];
  /** Values of the lender's per-case parameters given on the form. */
  parameterValues: { parameterId: string; value: number }[];
};

export type FieldErrors = Partial<Record<keyof z.input<typeof newCaseSchema> | "requirements" | `param_${string}`, string>>;

type FormValues = Record<string, string | undefined>;

/**
 * Validates the whole form; the document choices go through parseRequirementFields, the per-case parameter values
 * through parseCaseParameterFields (`required`: those the template's policy uses).
 */
export function parseNewCase(values: FormValues, parameters: readonly PolicyParameter[] = [], required: ReadonlySet<string> = new Set()): { ok: true; data: NewCase } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const parsed = newCaseSchema.safeParse({
    cif: values.cif ?? "",
    name: values.name ?? "",
    fiscalYearEnd: values.fiscalYearEnd ?? "",
    borrowerEmail: values.borrowerEmail ?? "",
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof FieldErrors;
      errors[key] ??= issue.message;
    }
  }

  const req = parseRequirementFields(values);
  const requirements = req.requirements;
  if (req.error) errors.requirements ??= req.error;

  const params = parseCaseParameterFields(values, parameters, required);
  if (!params.ok) Object.assign(errors, params.errors);

  if (!parsed.success || !params.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  const parameterValues = params.values.filter((v): v is { parameterId: string; value: number } => v.value !== null);
  return { ok: true, data: { ...parsed.data, requirements, parameterValues } };
}

/**
 * The document choices of the new-case form and the template form: `req_<kind>` = required | optional | lender | none,
 * `age_<kind>` = maximum age in days (only for documents that take one). At least one document.
 */
export function parseRequirementFields(values: FormValues): { requirements: NewCase["requirements"]; error: string | null } {
  let error: string | null = null;
  const requirements: NewCase["requirements"] = [];
  for (const kind of REQUIREMENT_KINDS) {
    const choice = values[`req_${kind}`] ?? "none";
    if (choice === "none") continue;
    if (!["required", "optional", "lender"].includes(choice)) {
      error ??= "Elige para cada documento si es obligatorio, opcional o lo subes tú.";
      continue;
    }
    const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
    const ageRaw = (values[`age_${kind}`] ?? "").trim();
    let maxAgeDays: number | null = null;
    if (spec.supportsMaxAge && ageRaw !== "") {
      const n = Number(ageRaw);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        error ??= `La antigüedad máxima de «${spec.label}» debe ser un número de días entre 1 y 3650.`;
      } else maxAgeDays = n;
    }
    // "lender": the analyst uploads it ("Lo subo yo"); the company's portal does not ask for it.
    requirements.push({ kind, required: choice !== "optional", maxAgeDays, source: choice === "lender" ? "lender" : "borrower" });
  }
  if (requirements.length === 0) error ??= "Solicita al menos un documento.";
  return { requirements, error };
}
