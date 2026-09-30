/**
 * BORME Section A ("Actos inscritos") parser. Input: the plain text of one provincial PDF; output: one entry per
 * company announcement, split into registry acts, with the registry sheet ("hoja") that identifies the company.
 *
 * Entry shape as published:
 *   412346 - TALLERES DEMO LEVANTE SL.
 *   Ceses/Dimisiones. Adm. Unico: LOPEZ MARTIN JUAN. Nombramientos. Adm. Unico: GARCIA RUIZ MARIA.
 *   Datos registrales. T 12345 , F 120, S 8, H V 123456, I/A 7 (21.09.26).
 *
 * Deterministic: entries are found by their consecutive announcement numbers, acts by the published act labels.
 * Text we cannot place is kept as an "other" act with a warning, never dropped. Pure; never throws on bad text.
 */
import { toNumber, type Warning } from "../types.ts";

export type ActType =
  | "constitution"
  | "appointments"
  | "cessations"
  | "revocations"
  | "reelections"
  | "capital_increase"
  | "capital_reduction"
  | "address_change"
  | "purpose_change"
  | "name_change"
  | "bylaw_changes"
  | "sole_shareholder"
  | "sole_shareholder_lost"
  | "dissolution"
  | "extinction"
  | "reactivation"
  | "insolvency"
  | "merger"
  | "spin_off"
  | "transformation"
  | "sheet_closed"
  | "sheet_reopened"
  | "officers_cancelled"
  | "other";

export interface Officer {
  role: string;
  name: string;
}

export interface ActDetails {
  officers?: Officer[];
  /** Share capital after the act (constitution capital, or "Resultante Suscrito"). */
  capital?: number;
  /** Amount subscribed (increase) or reduced (reduction). */
  amount?: number;
  /** New name (name change) or new address (address change). */
  value?: string;
}

export interface BormeAct {
  type: ActType;
  /** Label as published, e.g. "Ceses/Dimisiones". */
  label: string;
  /** Body after the label, without the trailing full stop. */
  text: string;
  details: ActDetails;
}

export interface RegistryData {
  /** Registry sheet, "<registry letters>-<number>" (e.g. "V-123456"): stable company identifier within BORME. */
  sheet: string | null;
  raw: string;
}

export interface BormeEntry {
  number: number;
  company: string;
  acts: BormeAct[];
  registry: RegistryData | null;
  /** Date the acts were entered in the registry, from "(21.09.26)". */
  registeredOn: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Act labels

/** Published labels, longest first where one is a prefix of another. Matched accent- and case-insensitively. */
const LABELS: [RegExp, ActType][] = [
  [/Constituci[oó]n/, "constitution"],
  [/Nombramientos/, "appointments"],
  [/Ceses\/Dimisiones/, "cessations"],
  [/Revocaciones/, "revocations"],
  [/Reelecciones/, "reelections"],
  [/Ampliaci[oó]n de capital/, "capital_increase"],
  [/Reducci[oó]n de capital/, "capital_reduction"],
  [/Cambio de domicilio social/, "address_change"],
  [/Cambio de objeto social/, "purpose_change"],
  [/Ampliaci[oó]n del objeto social/, "purpose_change"],
  [/Cambio de denominaci[oó]n social/, "name_change"],
  [/Modificaciones estatutarias/, "bylaw_changes"],
  [/Declaraci[oó]n de unipersonalidad/, "sole_shareholder"],
  [/Sociedad unipersonal/, "sole_shareholder"],
  [/P[eé]rdida del car[aá]cter de unipersonalidad/, "sole_shareholder_lost"],
  [/Disoluci[oó]n/, "dissolution"],
  [/Extinci[oó]n/, "extinction"],
  [/Reactivaci[oó]n de la sociedad[^.]*/, "reactivation"],
  [/Situaci[oó]n concursal/, "insolvency"],
  [/Suspensi[oó]n de pagos/, "insolvency"],
  [/Fusi[oó]n por absorci[oó]n/, "merger"],
  [/Fusi[oó]n por uni[oó]n/, "merger"],
  [/Escisi[oó]n (?:parcial|total)/, "spin_off"],
  [/Transformaci[oó]n de sociedad/, "transformation"],
  [/Cierre provisional[^.]*/, "sheet_closed"],
  [/Reapertura hoja registral/, "sheet_reopened"],
  [/Cancelaciones de oficio de nombramientos/, "officers_cancelled"],
  [/Modificaci[oó]n de poderes/, "other"],
  [/Modificaci[oó]n de duraci[oó]n/, "other"],
  [/Desembolso de dividendos pasivos/, "other"],
  [/Emisi[oó]n de obligaciones/, "other"],
  [/Otros conceptos/, "other"],
  [/Fe de erratas/, "other"],
  [/Cr[eé]dito incobrable/, "other"],
  [/Dep[oó]sito de libros/, "other"],
  [/Adaptaci[oó]n Ley 2\/95/, "other"],
  [/Adaptada seg[uú]n D\.T\. 2 apartado 2 Ley 2\/95/, "other"],
  [/Primera sucursal de sociedad extranjera/, "other"],
  [/Apertura de sucursal/, "other"],
  [/Cierre de sucursal/, "other"],
  [/Anotaci[oó]n preventiva[^.]*\.[^.]*/, "other"],
  [/Art[ií]culo 378\.5 del Reglamento del Registro Mercantil/, "other"],
  [/Empresario Individual/, "other"],
];
const REGISTRY_LABEL = /Datos registrales/;

// One alternation with a group per label; a label counts only at the start of the body or after ". ", and must be
// followed by "." or ":" (the details of an act use "Role: value", never "Label.").
const LABEL_RE = new RegExp(
  `(?:^|(?<=\\.)\\s+)(${[...LABELS.map(([r]) => r.source), REGISTRY_LABEL.source].map((s) => `(${s})`).join("|")})(?=[.:](?:\\s|$))`,
  "giu",
);

function labelType(groups: (string | undefined)[]): ActType | "registry" {
  // groups[0] is the whole alternation; then one group per LABELS entry, then the registry label.
  for (let i = 0; i < LABELS.length; i++) if (groups[i + 1] !== undefined) return LABELS[i][1];
  return "registry";
}

// ---------------------------------------------------------------------------------------------------------------
// Text clean-up

/** Page furniture repeated on every page of a BORME PDF. */
const FURNITURE = [
  /^BOLET[IÍ]N OFICIAL DEL REGISTRO MERCANTIL$/i,
  /^N[uú]m\. \d+ .*P[aá]g\. \d+$/i,
  /^cve: BORME-[A-Z]-\d{4}-\d+-\d+$/i,
  /^Verificable en https?:\/\/www\.boe\.es$/i,
  /^D\.L\.: .*ISSN: .*$/i,
  /^SECCI[OÓ]N PRIMERA$/i,
  /^Empresarios$/i,
  /^Actos inscritos$/i,
  /^https?:\/\/www\.boe\.es\S*$/i,
];

/** Joins the PDF lines into one string, dropping page furniture and undoing end-of-line hyphenation. */
export function cleanText(raw: string, province?: string): string {
  const provinceRe = province ? new RegExp(`^${province.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") : null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !FURNITURE.some((r) => r.test(l)) && !(provinceRe && provinceRe.test(l)));
  let out = "";
  for (const l of lines) {
    // "socie-/dad", "VALEN-/CIA": a word split at the line end continues in the same case on the next line.
    const split = /([a-záéíóúñ]|[A-ZÁÉÍÓÚÑ])-$/.exec(out);
    const sameCase = split && (/[a-záéíóúñ]/.test(split[1]) ? /^[a-záéíóúñ]/ : /^[A-ZÁÉÍÓÚÑ]/).test(l);
    if (sameCase) out = out.slice(0, -1) + l;
    else out += (out ? " " : "") + l;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Details

const DATE_RE = /\((\d{2})\.(\d{2})\.(\d{2})\)\s*\.?\s*$/;

function parseDate(m: RegExpExecArray | null): string | null {
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d), month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `20${y}-${mo}-${d}`;
}

/** "T 12345 , F 120, S 8, H V 123456, I/A 7 (21.09.26)." → sheet "V-123456". */
export function parseRegistry(text: string): RegistryData {
  const h = /(?:^|[\s,])H\s+([A-Z]{1,3})[\s-]*(\d{1,7})\b/.exec(text);
  return { sheet: h ? `${h[1]}-${h[2]}` : null, raw: text.trim() };
}

/** "Role: A;B. Role: C." pairs. Roles are short mixed-case keys ("Adm. Unico", "Consejero", "Apo.Sol."). */
function roleValues(text: string): [string, string][] {
  const out: [string, string][] = [];
  // A role key starts the text or follows ". ", and has lower-case letters (names are published in capitals).
  const key = /^([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚÑáéíóúñ.]*(?: [A-Za-zÁÉÍÓÚÑáéíóúñ.]+){0,3})\s*:\s*/;
  const keys: { role: string; start: number; end: number }[] = [];
  const candidates = [0, ...[...text.matchAll(/\.\s+/g)].map((m) => m.index! + m[0].length)];
  let from = 0;
  for (const c of candidates) {
    if (c < from) continue;
    const m = key.exec(text.slice(c));
    if (!m || !/[a-záéíóúñ]/.test(m[1])) continue;
    keys.push({ role: m[1].trim(), start: c, end: c + m[0].length });
    from = c + m[0].length;
  }
  keys.forEach((k, i) => {
    const value = text.slice(k.end, i + 1 < keys.length ? keys[i + 1].start : undefined).trim().replace(/\.$/, "").trim();
    out.push([k.role, value]);
  });
  return out;
}

const OFFICER_ACTS = new Set<ActType>(["appointments", "cessations", "revocations", "reelections", "officers_cancelled"]);

function details(type: ActType, text: string): ActDetails {
  const d: ActDetails = {};
  const pairs = roleValues(text);
  const money = (key: RegExp) => {
    const p = pairs.find(([k]) => key.test(k));
    return p ? toNumber(p[1].replace(/\s*Euros?\.?$/i, "")) : undefined;
  };
  if (OFFICER_ACTS.has(type)) {
    d.officers = pairs.flatMap(([role, value]) =>
      value
        .split(";")
        .map((n) => n.trim().replace(/\.$/, ""))
        .filter(Boolean)
        .map((name) => ({ role, name })),
    );
  }
  if (type === "constitution") d.capital = money(/^Capital$/i);
  if (type === "capital_increase") {
    d.amount = money(/^Suscrito$/i);
    d.capital = money(/^Resultante Suscrito$/i);
  }
  if (type === "capital_reduction") {
    d.amount = money(/^Importe reducci[oó]n$/i);
    d.capital = money(/^Resultante Suscrito$/i);
  }
  if (type === "name_change" || type === "address_change") {
    const v = text.replace(/^Nuevo domicilio:\s*/i, "").trim();
    if (v) d.value = v;
  }
  for (const k of Object.keys(d) as (keyof ActDetails)[]) if (d[k] === undefined) delete d[k];
  return d;
}

// ---------------------------------------------------------------------------------------------------------------
// Entries

/** Positions of "N - " where N follows on from the previous announcement number. */
function entryStarts(text: string): { number: number; index: number; bodyStart: number }[] {
  const re = /(?:^|\s)(\d{1,7}) - (?=\S)/g;
  const all: { number: number; index: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) all.push({ number: Number(m[1]), index: m.index, bodyStart: re.lastIndex });
  const out: typeof all = [];
  for (const c of all) {
    const prev = out.at(-1);
    if (!prev) {
      // The first entry: accept it only if the next candidate continues the sequence (or it is the only one).
      const next = all.find((x) => x.index > c.index && x.number === c.number + 1);
      if (next || all.length === 1) out.push(c);
    } else if (c.number === prev.number + 1) out.push(c);
  }
  return out;
}

export interface ParseResult {
  data: BormeEntry[];
  warnings: Warning[];
}

/** Parses the text of one Section A PDF. `province` (the PDF's title) lets the running header be dropped. */
export function parseSectionA(raw: string, opts: { province?: string } = {}): ParseResult {
  const warnings: Warning[] = [];
  const text = cleanText(raw, opts.province);
  const starts = entryStarts(text);
  if (starts.length === 0) {
    if (text.trim()) warnings.push({ code: "borme_no_entries", message: "No se han encontrado anuncios en el texto del BORME." });
    return { data: [], warnings };
  }

  const data: BormeEntry[] = [];
  starts.forEach((s, i) => {
    const body = text.slice(s.bodyStart, i + 1 < starts.length ? starts[i + 1].index : undefined).trim();
    const labels: { type: ActType | "registry"; label: string; start: number; end: number }[] = [];
    LABEL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LABEL_RE.exec(body))) {
      const labelStart = m.index + m[0].length - m[1].length;
      labels.push({ type: labelType(m.slice(1)), label: m[1], start: labelStart, end: labelStart + m[1].length + 1 });
    }
    const company = (labels.length ? body.slice(0, labels[0].start) : body).trim().replace(/\.$/, "").trim();
    if (!labels.length) {
      warnings.push({ code: "borme_entry_without_acts", message: `Anuncio ${s.number}: no se reconoce ningún acto.`, detail: { entry: s.number } });
    }

    const acts: BormeAct[] = [];
    let registry: RegistryData | null = null;
    let registeredOn: string | null = null;
    labels.forEach((l, j) => {
      const text = body.slice(l.end, j + 1 < labels.length ? labels[j + 1].start : undefined).trim().replace(/\.$/, "").trim();
      if (l.type === "registry") {
        registry = parseRegistry(text);
        registeredOn = parseDate(DATE_RE.exec(text));
        return;
      }
      acts.push({ type: l.type, label: l.label, text, details: details(l.type, text) });
    });
    if (!registry) warnings.push({ code: "borme_no_registry_data", message: `Anuncio ${s.number} (${company}): sin datos registrales.`, detail: { entry: s.number } });
    else if (!(registry as RegistryData).sheet) warnings.push({ code: "borme_no_sheet", message: `Anuncio ${s.number} (${company}): sin número de hoja registral.`, detail: { entry: s.number } });
    data.push({ number: s.number, company, acts, registry, registeredOn });
  });
  return { data, warnings };
}
