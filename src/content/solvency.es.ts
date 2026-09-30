/** Informe de solvencia copy (Spanish). Provider figures are always attributed: "según Experian". */

export const SOLVENCY_PROVIDER_LABEL: Record<string, string> = {
  experian: "Experian",
  informa: "Informa",
  axesor: "Axesor",
  iberinform: "Iberinform",
  einforma: "eInforma",
  equifax: "Equifax",
  other: "el proveedor",
};

export const INCIDENT_REGISTRY_LABEL: Record<string, string> = {
  rai: "RAI",
  asnef_empresas: "ASNEF-Empresas",
  experian_bureau: "Experian Bureau de Crédito",
  badexcug: "BADEXCUG",
  other: "Otro fichero",
};

export const JUDICIAL_TYPE_LABEL: Record<string, string> = {
  concurso: "Concurso",
  embargo: "Embargo",
  lawsuit: "Demanda judicial",
  public_claim: "Reclamación de organismo público",
  other: "Otra incidencia",
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = { active: "Activa", resolved: "Resuelta", unknown: "Sin estado" };

/** Shown next to the provider's rating, probability of default and credit limit. */
export const PROVIDER_FIGURES_NOTE = "Datos del proveedor tal como figuran en su informe. credIA no los calcula ni los usa en sus verificaciones.";
