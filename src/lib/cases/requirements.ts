/** Documents a lender can request on a case, and how complete a case is. Pure. */

export const REQUIREMENT_KINDS = [
  "trial_balance",
  "norma43",
  "modelo200",
  "cuentas_anuales",
  "cirbe",
  "aeat_cert",
  "tgss_cert",
  "solvency_report",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export interface RequirementSpec {
  kind: RequirementKind;
  label: string;
  hint: string;
  defaultRequired: boolean | null; // null = not requested by default
  defaultMaxAgeDays: number | null;
  supportsMaxAge: boolean;
}

export const REQUIREMENT_SPECS: RequirementSpec[] = [
  { kind: "trial_balance", label: "Contabilidad", hint: "Sumas y saldos o conexión con Holded", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "norma43", label: "Extractos bancarios (Norma 43)", hint: "Últimos 12 meses, todas las cuentas", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "modelo200", label: "Modelo 200", hint: "Impuesto sobre Sociedades del último ejercicio", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "cuentas_anuales", label: "Cuentas anuales", hint: "Depositadas en el Registro Mercantil", defaultRequired: false, defaultMaxAgeDays: null, supportsMaxAge: false },
  { kind: "cirbe", label: "Informe CIRBE", hint: "Banco de España", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: true },
  { kind: "aeat_cert", label: "Certificado AEAT", hint: "Estar al corriente con Hacienda", defaultRequired: true, defaultMaxAgeDays: null, supportsMaxAge: true },
  { kind: "tgss_cert", label: "Certificado TGSS", hint: "Estar al corriente con la Seguridad Social", defaultRequired: true, defaultMaxAgeDays: 90, supportsMaxAge: true },
  { kind: "solvency_report", label: "Informe de solvencia", hint: "Experian, Informa, Axesor, Iberinform…", defaultRequired: null, defaultMaxAgeDays: 90, supportsMaxAge: true },
];

export interface CaseRequirement {
  doc_kind: string;
  required: boolean;
}
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

/** Share of required documents provided. Optional ones don't count toward the total. */
export function completeness(reqs: CaseRequirement[], docs: CaseDocument[], holded: CaseHoldedConnection[]) {
  const required = reqs.filter((r) => r.required);
  const done = required.filter((r) => isRequirementMet(r.doc_kind, docs, holded)).length;
  const total = required.length;
  return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
}
