/**
 * Turning an answer into a conclusion for the package. Pure.
 *
 * The analyst may edit the text before saving. Only citations of the original answer survive (a token that was not
 * in it is dropped), citations whose token was edited out are not kept, and a text that states a figure without a
 * citation is refused: no number without provenance reaches the memo.
 */
import { RefRegistry, validateAnswer, type Citation } from "./refs.ts";

export const MAX_CONCLUSION_CHARS = 4000;

export type PreparedConclusion = { ok: true; text: string; citations: Citation[] } | { ok: false; reason: "empty" | "too_long" | "uncited"; uncited?: string[] };

export function prepareConclusion(text: string, answerCitations: readonly Citation[]): PreparedConclusion {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_CONCLUSION_CHARS) return { ok: false, reason: "too_long" };
  const registry = new RefRegistry();
  answerCitations.forEach((c) => registry.addCitation(c));
  const v = validateAnswer(trimmed, registry);
  if (v.uncited.length) return { ok: false, reason: "uncited", uncited: v.uncited };
  return { ok: true, text: v.text, citations: v.citations };
}

/** For editing: citation tokens become « [1]», « [2]»… in order of first appearance. */
export function toEditable(text: string, citations: readonly Citation[]): string {
  const byHandle = new Map(citations.map((c) => [c.h, c]));
  const numbers = new Map<string, number>();
  return text.replace(/\[\[ref:([a-z0-9]{1,16})\]\]/g, (_t, h: string) => {
    if (!byHandle.has(h)) return "";
    if (!numbers.has(h)) numbers.set(h, numbers.size + 1);
    return `[${numbers.get(h)}]`;
  });
}

/** Back from editing: «[n]» → the n-th citation's token (as numbered by toEditable); other brackets stay text. */
export function fromEditable(edited: string, original: string, citations: readonly Citation[]): string {
  const byHandle = new Map(citations.map((c) => [c.h, c]));
  const order: string[] = [];
  for (const m of original.matchAll(/\[\[ref:([a-z0-9]{1,16})\]\]/g)) if (byHandle.has(m[1]) && !order.includes(m[1])) order.push(m[1]);
  return edited.replace(/\[(\d{1,3})\]/g, (t, n: string) => {
    const h = order[Number(n) - 1];
    return h ? `[[ref:${h}]]` : t;
  });
}
