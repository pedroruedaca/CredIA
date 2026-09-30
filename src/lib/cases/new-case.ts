/** Validation for the "Nuevo caso" form. Pure: takes plain form values, returns data or Spanish field errors. */
import { z } from "zod";
import { PRODUCTS } from "../../content/products.es.ts";
import { isValidCif, normalizeCif } from "../cif.ts";
import { toNumber } from "../types.ts";
import { REQUIREMENT_KINDS, REQUIREMENT_SPECS, type RequirementKind, type RequirementSource } from "./requirements.ts";

/** Amounts typed by Spanish users: "250.000" is two hundred fifty thousand, not 250. */
export function parseAmountEs(raw: string): number {
  const s = raw.trim().replace(/[\s€]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  return toNumber(s);
}

const productValues = PRODUCTS.map((p) => p.value) as [string, ...string[]];

export const newCaseSchema = z.object({
  cif: z
    .string()
    .transform(normalizeCif)
    .refine(isValidCif, "El CIF no es válido. Revisa la letra inicial y el dígito de control."),
  name: z.string().trim().min(2, "Indica la razón social.").max(200),
  amount: z
    .string()
    .transform(parseAmountEs)
    .refine((n) => n > 0, "Indica un importe mayor que 0.")
    .refine((n) => n <= 1_000_000_000, "El importe es demasiado alto."),
  product: z.enum(productValues, { message: "Elige un producto." }),
  termMonths: z.coerce
    .number({ message: "Indica el plazo en meses." })
    .int("El plazo debe ser un número entero de meses.")
    .min(1, "El plazo mínimo es 1 mes.")
    .max(360, "El plazo máximo es 360 meses."),
  fiscalYearEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de cierre del último ejercicio.")
    .refine((d) => !Number.isNaN(Date.parse(d)) && d <= new Date().toISOString().slice(0, 10), "El cierre del último ejercicio no puede estar en el futuro."),
  borrowerEmail: z.string().trim().toLowerCase().email("Indica un correo electrónico válido."),
});

export type NewCase = z.infer<typeof newCaseSchema> & {
  requirements: { kind: RequirementKind; required: boolean; maxAgeDays: number | null; source: RequirementSource }[];
};

export type FieldErrors = Partial<Record<keyof z.input<typeof newCaseSchema> | "requirements", string>>;

type FormValues = Record<string, string | undefined>;

/**
 * Requirement fields are `req_<kind>` = required | optional | cif | none, and `age_<kind>` = days. `cif` (the lender
 * obtains it by the company's CIF) only for documents that can be; it counts as required and the company is not asked.
 */
export function parseNewCase(values: FormValues): { ok: true; data: NewCase } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const parsed = newCaseSchema.safeParse({
    cif: values.cif ?? "",
    name: values.name ?? "",
    amount: values.amount ?? "",
    product: values.product ?? "",
    termMonths: values.termMonths ?? "",
    fiscalYearEnd: values.fiscalYearEnd ?? "",
    borrowerEmail: values.borrowerEmail ?? "",
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof FieldErrors;
      errors[key] ??= issue.message;
    }
  }

  const requirements: NewCase["requirements"] = [];
  for (const kind of REQUIREMENT_KINDS) {
    const choice = values[`req_${kind}`] ?? "none";
    if (choice === "none") continue;
    const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
    if (choice === "cif" && !spec.byCif) {
      errors.requirements ??= `«${spec.label}» no se puede obtener por CIF; pídeselo a la empresa.`;
      continue;
    }
    const ageRaw = (values[`age_${kind}`] ?? "").trim();
    let maxAgeDays: number | null = null;
    if (spec.supportsMaxAge && ageRaw !== "") {
      const n = Number(ageRaw);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        errors.requirements ??= `La antigüedad máxima de «${spec.label}» debe ser un número de días entre 1 y 3650.`;
      } else maxAgeDays = n;
    }
    requirements.push({ kind, required: choice !== "optional", maxAgeDays, source: choice === "cif" ? "cif" : "borrower" });
  }
  if (requirements.length === 0) errors.requirements ??= "Solicita al menos un documento.";

  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { ...parsed.data, requirements } };
}
