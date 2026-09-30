/**
 * Company names as BORME and lenders write them differ in accents, punctuation and the legal-form suffix
 * ("Talleres Demo Levante, S.L." vs "TALLERES DEMO LEVANTE SL"). This key makes them comparable. Pure.
 */

// Legal forms, matched on the normalised (unaccented, no punctuation) name, longest first.
const LEGAL_FORMS = [
  "SOCIEDAD LIMITADA NUEVA EMPRESA",
  "SOCIEDAD LIMITADA LABORAL",
  "SOCIEDAD LIMITADA UNIPERSONAL",
  "SOCIEDAD ANONIMA UNIPERSONAL",
  "SOCIEDAD ANONIMA LABORAL",
  "SOCIEDAD COOPERATIVA",
  "SOCIEDAD LIMITADA",
  "SOCIEDAD ANONIMA",
  "S COOP",
  "SLNE",
  "SLL",
  "SLU",
  "SAL",
  "SAU",
  "SL",
  "SA",
];
const TRAILERS = ["EN LIQUIDACION", "EN CONCURSO"];

/** "Talleres Demo Levante, S.L." → "TALLERES DEMO LEVANTE". */
export function companyKey(name: string): string {
  let s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\(R\.\s?M\.[^)]*\)/g, " ") // "SL(R.M. SANTIAGO DE COMPOSTELA)": the registry, not the name
    .replace(/&/g, " Y ")
    .replace(/(\b[A-Z])\.(?=[A-Z]\b\.?)/g, "$1") // S.L. → SL., S.A.U. → SAU.
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of [...TRAILERS, ...LEGAL_FORMS]) {
      if (s === t) continue;
      if (s.endsWith(` ${t}`)) {
        s = s.slice(0, -t.length - 1).trim();
        changed = true;
      }
    }
  }
  return s;
}
