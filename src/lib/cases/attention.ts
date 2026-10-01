/**
 * Who a case is waiting on, for the case list filters and the "Te toca subir" pill. Pure.
 *
 * The case status follows the company and the processing (awaiting_documents → processing → ready / needs_review);
 * the analyst's own uploads ("Lo subo yo") are a separate track that can overlap any of them.
 */
import { borrowerRequirements, isLenderProvided, isRequirementMet, type CaseDocument, type CaseHoldedConnection, type CaseRequirement } from "./requirements.ts";

/** Required documents the analyst marked "Lo subo yo" and has not provided yet. */
export function analystPending(reqs: CaseRequirement[], docs: CaseDocument[]): string[] {
  return reqs.filter((r) => r.required && isLenderProvided(r.source) && !isRequirementMet(r.doc_kind, docs, [])).map((r) => r.doc_kind);
}

/** Required documents the company has not provided yet. */
export function companyPending(reqs: CaseRequirement[], docs: CaseDocument[], holded: CaseHoldedConnection[]): string[] {
  return borrowerRequirements(reqs).filter((r) => r.required && !isRequirementMet(r.doc_kind, docs, holded)).map((r) => r.doc_kind);
}

/**
 * A case with nothing for the company to provide is "submitted" once the analyst's required documents are in: it
 * then moves on like a case the company submitted (processing → ready / needs_review).
 */
export function analystCompletesCase(reqs: CaseRequirement[], docs: CaseDocument[]): boolean {
  if (borrowerRequirements(reqs).length > 0) return false;
  const mine = reqs.filter((r) => isLenderProvided(r.source));
  return mine.length > 0 && analystPending(reqs, docs).length === 0 && mine.some((r) => isRequirementMet(r.doc_kind, docs, []));
}

export const CASE_FILTERS = ["todos", "atencion", "empresa", "procesando"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export interface FilterableCase {
  status: string;
  case_requirements: CaseRequirement[];
  documents: CaseDocument[];
  holded_connections: CaseHoldedConnection[];
}

/**
 * - atencion: something is on the lender — documents it has to upload, a package ready to review, or documents that
 *   need review.
 * - empresa: waiting on the company (its required documents are not all in, or it has not submitted).
 * - procesando: documents being read.
 */
export function matchesFilter(c: FilterableCase, f: CaseFilter): boolean {
  switch (f) {
    case "todos":
      return true;
    case "atencion":
      return analystPending(c.case_requirements, c.documents).length > 0 || c.status === "ready" || c.status === "needs_review";
    case "empresa":
      return c.status === "awaiting_documents" && borrowerRequirements(c.case_requirements).length > 0;
    case "procesando":
      return c.status === "processing";
  }
}

export const parseFilter = (v: string | string[] | undefined): CaseFilter => {
  const s = Array.isArray(v) ? v[0] : v;
  return (CASE_FILTERS as readonly string[]).includes(s ?? "") ? (s as CaseFilter) : "todos";
};
