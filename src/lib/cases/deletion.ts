/**
 * Deleting a case for good (end of a pilot, a company that asks to be forgotten). Pure helpers; the action is
 * `deleteCase` in src/app/casos/[id]/delete-action.ts.
 *
 * What goes: every row of the case (on delete cascade: documents, extractions, statements, KPIs, checks, bank movements,
 * CIRBE positions, links, assistant and analyst threads, conclusions, reviews, BORME match, audit rows) and every file
 * of the case in storage (uploads under `cases/<id>/`, Holded raw ledgers under `raw/holded/<id>/`, and any path a row
 * names). What stays: one audit row, without the case id as a foreign key, saying who deleted which case and when.
 */
import { normalizeCif } from "../cif.ts";

/** The owner confirms by typing the company's CIF (spaces, dashes and case ignored). */
export function confirmsDeletion(typed: string, cif: string): boolean {
  const a = normalizeCif(typed ?? "");
  return a.length > 0 && a === normalizeCif(cif);
}

/** Storage prefixes that only ever hold this case's files. */
export const casePrefixes = (caseId: string) => [`cases/${caseId}`, `raw/holded/${caseId}`];

/** Every file to remove: what the listing found under the case's prefixes plus any path a row names, once each. */
export function filesToRemove(caseId: string, listed: readonly string[], named: readonly (string | null | undefined)[]): string[] {
  const prefixes = casePrefixes(caseId).map((p) => `${p}/`);
  const own = (p: string) => prefixes.some((x) => p.startsWith(x));
  // A row could name a path outside the case's prefixes only through a bug; never delete another case's file for it.
  return [...new Set([...listed, ...named.filter((p): p is string => !!p)])].filter(own).sort();
}
