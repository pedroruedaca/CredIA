/**
 * When a case is stuck in processing and should be run again. A run can die with its serverless request (time limit,
 * deploy, database briefly read-only) or leave documents waiting when Claude was unavailable; nothing else would
 * start it again. Pure.
 */

/** Give a run that just started time to finish before calling the case stuck. */
export const STUCK_AFTER_MS = 3 * 60 * 1000;
/** Same as the pipeline: a document "parsing" for longer than this died with its run. */
export const STALE_PARSING_MS = 15 * 60 * 1000;

export interface CaseProcessingState {
  status: string;
  submitted_at: string | null;
  processing_lock_until: string | null;
  processing_requested: boolean;
  processed_at: string | null;
  documents: { status: string; uploaded_at: string; processing_started_at: string | null; extractions: number }[];
}

export type StuckReason = "requested" | "waiting_documents" | "stale_parsing" | "submitted_not_finalised";

export function stuckReason(c: CaseProcessingState, now = new Date()): StuckReason | null {
  const t = now.getTime();
  const older = (iso: string | null, ms: number) => !!iso && t - new Date(iso).getTime() > ms;
  if (c.status === "archived") return null;
  // A live run holds the lock; leave it alone.
  if (c.processing_lock_until && new Date(c.processing_lock_until).getTime() > t) return null;

  if (c.processing_requested) return "requested";
  if (c.documents.some((d) => d.status === "parsing" && (!d.processing_started_at || older(d.processing_started_at, STALE_PARSING_MS)))) return "stale_parsing";
  // Uploaded and never read (no extraction at all, not even a "pending" one) for a few minutes.
  if (c.documents.some((d) => d.status === "uploaded" && d.extractions === 0 && older(d.uploaded_at, STUCK_AFTER_MS))) return "waiting_documents";
  // Submitted, shown as processing, but no run has finished since the submission.
  if (c.status === "processing" && c.submitted_at && older(c.submitted_at, STUCK_AFTER_MS) && (!c.processed_at || c.processed_at < c.submitted_at)) {
    return "submitted_not_finalised";
  }
  return null;
}
