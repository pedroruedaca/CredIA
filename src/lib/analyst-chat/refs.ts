/**
 * Citations for «Preguntar al caso». Pure; used by the server (validation) and the browser (rendering).
 *
 * Every figure the tools return is registered under a short, stable handle (`r` + 8 base-36 chars, a hash of the
 * figure's id) with its label, value and source_ref. The model cites with `[[ref:<handle>]]` right after a figure.
 * The server keeps only handles a tool returned in this conversation (unknown ones are dropped), and reports
 * sentences that state a figure with no citation: no number without provenance reaches the analyst unflagged.
 */

export interface RefEntry {
  /** Internal id the handle is derived from (`kpi:closed_fy:ebitda`, a bank row's source_ref…). */
  id: string;
  label: string;
  /** Numeric value, when the entry is a figure (operands of `compute`). */
  value?: number;
  unit?: "EUR" | "%" | "x" | "days" | "count";
  /** The document/ledger/BORME reference behind it, when there is one. */
  sourceRef?: string | null;
  /** Where to open it (a document page, a check's evidence, a BORME PDF). */
  href?: string | null;
}

/** What an answer (or a conclusion) keeps for each citation. */
export interface Citation {
  h: string;
  label: string;
  sourceRef: string | null;
  href: string | null;
}

/** FNV-1a 32-bit, twice with different seeds, base 36: short and stable across turns and deploys. */
export function refHandle(id: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  return `r${fnv(0x811c9dc5).toString(36).padStart(7, "0")}${(fnv(0x5bd1e995) % 36).toString(36)}`;
}

/** The figures and sources one conversation has seen, by handle. */
export class RefRegistry {
  private entries = new Map<string, RefEntry>();

  /** Registers an entry and returns its handle (the same id always gives the same handle). */
  add(entry: RefEntry): string {
    const h = refHandle(entry.id);
    this.entries.set(h, entry);
    return h;
  }

  /** Earlier answers' citations, so a follow-up may cite what was already shown (label and link only, no value). */
  addCitation(c: Citation) {
    if (!this.entries.has(c.h)) this.entries.set(c.h, { id: `cited:${c.h}`, label: c.label, sourceRef: c.sourceRef, href: c.href });
  }

  get(h: string): RefEntry | undefined {
    return this.entries.get(h);
  }

  get size() {
    return this.entries.size;
  }

  citation(h: string): Citation | null {
    const e = this.entries.get(h);
    return e ? { h, label: e.label, sourceRef: e.sourceRef ?? null, href: e.href ?? null } : null;
  }
}

export const REF_TOKEN = /\[\[ref:([a-z0-9]{1,16})\]\]/g;
const HAS_REF = /\[\[ref:[a-z0-9]{1,16}\]\]/;

/**
 * A figure: a number with thousands separators or decimals, or an integer with a money/ratio unit (%, €, k€, M€,
 * veces). Bare integers (account codes, pages, counts of documents) and periods («los últimos 12 meses») are not.
 */
const FIGURE = /\d{1,3}(?:\.\d{3})+(?:,\d+)?(?:\s*(?:%|€|k€|M€|días|meses|veces|x\b))?|\d+,\d+(?:\s*(?:%|€|k€|M€|días|meses|veces|x\b))?|\d+\s*(?:%|€|k€|M€|mil\b|millones|veces|x\b)/gi;
/** Dates and years are not figures that need a source. */
const DATES = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b(?!\s*(?:%|€|k€|M€))/g;

/** Splits an answer into the units citations are checked against: list items and sentences. */
function units(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.;:!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡(«])/))
    .map((s) => s.trim().replace(/^(?:[-•*]|\d+[.)])\s+/, ""))
    .filter(Boolean);
}

/**
 * Does every figure in this sentence have a citation after it (before the next figure)? A sentence that cites one
 * figure and states another without a source is still flagged.
 */
function allFiguresCited(unit: string): boolean {
  const masked = unit.replace(DATES, (d) => " ".repeat(d.length));
  const figures = [...masked.matchAll(FIGURE)];
  return figures.every((m, i) => {
    const end = m.index! + m[0].length;
    const next = figures[i + 1]?.index ?? unit.length;
    return HAS_REF.test(unit.slice(end, next));
  });
}

export interface ValidatedAnswer {
  /** The answer with unknown citation tokens removed. */
  text: string;
  /** Distinct citations in order of first appearance. */
  citations: Citation[];
  /** Sentences or list items that state a figure and cite nothing. */
  uncited: string[];
}

export function validateAnswer(raw: string, registry: Pick<RefRegistry, "citation">): ValidatedAnswer {
  const seen = new Map<string, Citation>();
  const text = raw.replace(REF_TOKEN, (token, h: string) => {
    const c = registry.citation(h);
    if (!c) return "";
    if (!seen.has(h)) seen.set(h, c);
    return token;
  }).replace(/[ \t]+([.,;:])/g, "$1");
  const uncited = units(text).filter((u) => !allFiguresCited(u));
  return { text: text.trim(), citations: [...seen.values()], uncited };
}

export type CitedSegment = { type: "text"; text: string } | { type: "cite"; n: number; citation: Citation };

/**
 * Text + citation markers for display: each distinct citation gets a number (1, 2…) in order of first appearance.
 * Tokens with no citation are dropped, and an unfinished token at the end of a streaming chunk is hidden.
 */
export function splitCitations(text: string, citations: readonly Citation[]): CitedSegment[] {
  const byHandle = new Map(citations.map((c) => [c.h, c]));
  const numbers = new Map<string, number>();
  const out: CitedSegment[] = [];
  const partial = text.lastIndexOf("[[");
  const body = partial >= 0 && !text.slice(partial).includes("]]") ? text.slice(0, partial) : text;
  let at = 0;
  const push = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };
  for (const m of body.matchAll(REF_TOKEN)) {
    push(body.slice(at, m.index));
    at = m.index! + m[0].length;
    const c = byHandle.get(m[1]);
    if (!c) continue;
    if (!numbers.has(c.h)) numbers.set(c.h, numbers.size + 1);
    out.push({ type: "cite", n: numbers.get(c.h)!, citation: c });
  }
  push(body.slice(at));
  return out;
}

/** For the PDF and the exports: «… 1.234 € [1] …» and the numbered sources. */
export function footnoted(text: string, citations: readonly Citation[]): { text: string; notes: (Citation & { n: number })[] } {
  const segs = splitCitations(text, citations);
  const notes = new Map<string, Citation & { n: number }>();
  const out = segs
    .map((s) => {
      if (s.type === "text") return s.text;
      notes.set(s.citation.h, { ...s.citation, n: s.n });
      return ` [${s.n}]`;
    })
    .join("")
    .replace(/\s+\[/g, " [")
    .replace(/\*\*/g, "");
  return { text: out.trim(), notes: [...notes.values()] };
}

/** Citations stored in the database → valid ones only. */
export function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) =>
    c && typeof c === "object" && typeof (c as Citation).h === "string" && typeof (c as Citation).label === "string"
      ? [{ h: (c as Citation).h, label: (c as Citation).label, sourceRef: typeof (c as Citation).sourceRef === "string" ? (c as Citation).sourceRef : null, href: typeof (c as Citation).href === "string" ? (c as Citation).href : null }]
      : [],
  );
}
