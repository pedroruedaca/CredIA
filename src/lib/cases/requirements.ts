/** Documents a lender can request on a case, and how complete a case is. Pure. */

export const REQUIREMENT_KINDS = [
  "trial_balance",
  "norma43",
  "modelo200",
  "modelo303",
  "cuentas_anuales",
  "cirbe",
  "aeat_cert",
  "tgss_cert",
  "solvency_report",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

/** Who provides a requested document: the company (portal) or the lender's analyst (case view, "Lo subo yo"). */
export type RequirementSource = "borrower" | "lender";

export interface RequirementSpec {
  kind: RequirementKind;
  label: string;
  hint: string;
  defaultRequired: boolean | null; // level when the lender selects it: false = optional; true/null = required
  defaultMaxAgeDays: number | null;
  supportsMaxAge: boolean;
  /** Requested together with other kinds under one choice in the new-case form (see REQUIREMENT_MODULES). */
  module?: "fiscal";
}

export const REQUIREMENT_SPECS: RequirementSpec[] = [
  { kind: "trial_balance", label: "Contabilidad", hint: "Sumas y saldos o conexión con Holded", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "norma43", label: "Extractos bancarios (Norma 43)", hint: "Últimos 12 meses, todas las cuentas", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "modelo200", label: "Modelo 200", hint: "Impuesto sobre Sociedades del último ejercicio", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false, module: "fiscal" },
  { kind: "modelo303", label: "Modelo 303", hint: "IVA de los últimos 4 trimestres", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false, module: "fiscal" },
  { kind: "cuentas_anuales", label: "Cuentas anuales", hint: "Depositadas en el Registro Mercantil", defaultRequired: false, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "cirbe", label: "Informe CIRBE", hint: "Banco de España", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: true },
  { kind: "aeat_cert", label: "Certificado AEAT", hint: "Estar al corriente con Hacienda", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: true },
  { kind: "tgss_cert", label: "Certificado TGSS", hint: "Estar al corriente con la Seguridad Social", defaultRequired: true, defaultMaxAgeDays: 90, supportsMaxAge: true },
  { kind: "solvency_report", label: "Informe de solvencia", hint: "Experian, Informa, Axesor, Iberinform…", defaultRequired: null, defaultMaxAgeDays: 90, supportsMaxAge: true },
];

/** One choice in the new-case form: a single document, or several requested together ("Documentos fiscales"). */
export interface RequirementModule {
  id: string;
  label: string;
  hint: string;
  specs: RequirementSpec[];
}

const MODULE_COPY = { fiscal: { label: "Documentos fiscales", hint: "Modelo 200 del último ejercicio y Modelo 303 (IVA) de los últimos 4 trimestres" } };

export const REQUIREMENT_MODULES: RequirementModule[] = REQUIREMENT_SPECS.reduce<RequirementModule[]>((out, spec) => {
  const id = spec.module ?? spec.kind;
  const existing = out.find((m) => m.id === id);
  if (existing) existing.specs.push(spec);
  else out.push({ id, ...(spec.module ? MODULE_COPY[spec.module] : { label: spec.label, hint: spec.hint }), specs: [spec] });
  return out;
}, []);


export interface CaseRequirement {
  doc_kind: string;
  required: boolean;
  /** Missing before migration 0014 and in older rows: the company. "cif" before 0017 means the lender. */
  source?: RequirementSource | string | null;
}

/** Provided by the lender's analyst ("cif" is the value before migration 0017). */
export const isLenderProvided = (source: string | null | undefined) => source === "lender" || source === "cif";

/** Requirements the company provides through its portal (not the ones the analyst uploads). */
export const borrowerRequirements = <T extends CaseRequirement>(reqs: T[]) => reqs.filter((r) => !isLenderProvided(r.source));
export interface CaseDocument {
  kind: string;
  status: string;
}
export interface CaseHoldedConnection {
  status: string;
}

/** A document counts once received and not rejected by processing. */
const PROVIDED = new Set(["uploaded", "parsing", "parsed"]);

export function isRequirementMet(kind: string, docs: CaseDocument[], holded: CaseHoldedConnection[]): boolean {
  if (docs.some((d) => d.kind === kind && PROVIDED.has(d.status))) return true;
  return kind === "trial_balance" && holded.some((h) => h.status === "synced");
}

/** Share of required documents the company has provided. Optional ones and those the analyst uploads don't count. */
export function completeness(reqs: CaseRequirement[], docs: CaseDocument[], holded: CaseHoldedConnection[]) {
  const required = borrowerRequirements(reqs).filter((r) => r.required);
  const done = required.filter((r) => isRequirementMet(r.doc_kind, docs, holded)).length;
  const total = required.length;
  return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
}
