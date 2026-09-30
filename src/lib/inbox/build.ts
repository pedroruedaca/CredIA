/**
 * Bandeja: what needs the lender's attention across cases, from rows the lender can already read. Pure.
 * An item is pending until it is handled: help marked attended, the case opened after a submission, a consent
 * withdrawal or new BORME acts, or the document no longer needing review.
 */

export const INBOX_WINDOW_DAYS = 30;

export type InboxKind = "support" | "submitted" | "consent_withdrawn" | "needs_review" | "registry";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  caseId: string;
  company: string;
  at: string;
  pending: boolean;
  /** Help requests: what the company wrote. Documents: the document kind. */
  detail: string | null;
  actor?: "borrower" | "delegate";
  supportRequestId?: string;
  /** Registry items: the most severe act sets the tone. */
  tone?: "high" | "warn" | "info";
}

export interface InboxInput {
  support: { id: string; case_id: string; actor: "borrower" | "delegate"; message: string | null; status: "open" | "closed"; created_at: string; company: string }[];
  cases: { id: string; company: string; submitted_at: string | null; consent_withdrawn_at: string | null }[];
  /** Case views by anyone at the lender (audit_log case.viewed). */
  views: { case_id: string; at: string }[];
  needsReview: { id: string; case_id: string; kind: string; uploaded_at: string; company: string }[];
  /** New BORME acts for a case's confirmed company (audit_log borme.new_acts). */
  registry?: { id: string; case_id: string; at: string; company: string; acts: { label: string; severity: "high" | "warn" | "info" | null }[] }[];
}

export function buildInbox(input: InboxInput, now = new Date()): { items: InboxItem[]; pendingCount: number } {
  const since = new Date(now.getTime() - INBOX_WINDOW_DAYS * 86_400_000).toISOString();
  const lastView = new Map<string, string>();
  for (const v of input.views) if ((lastView.get(v.case_id) ?? "") < v.at) lastView.set(v.case_id, v.at);
  const viewedAfter = (caseId: string, at: string) => (lastView.get(caseId) ?? "") > at;

  const items: InboxItem[] = [];
  for (const s of input.support) {
    if (s.status === "closed" && s.created_at < since) continue;
    items.push({ id: `support:${s.id}`, kind: "support", caseId: s.case_id, company: s.company, at: s.created_at, pending: s.status === "open", detail: s.message, actor: s.actor, supportRequestId: s.id });
  }
  for (const c of input.cases) {
    if (c.submitted_at && c.submitted_at >= since) {
      items.push({ id: `submitted:${c.id}`, kind: "submitted", caseId: c.id, company: c.company, at: c.submitted_at, pending: !viewedAfter(c.id, c.submitted_at), detail: null });
    }
    if (c.consent_withdrawn_at && c.consent_withdrawn_at >= since) {
      items.push({ id: `consent:${c.id}`, kind: "consent_withdrawn", caseId: c.id, company: c.company, at: c.consent_withdrawn_at, pending: !viewedAfter(c.id, c.consent_withdrawn_at), detail: null });
    }
  }
  for (const r of input.registry ?? []) {
    if (r.at < since) continue;
    const labels = [...new Set(r.acts.map((a) => a.label))];
    const tone = r.acts.some((a) => a.severity === "high") ? "high" : r.acts.some((a) => a.severity === "warn") ? "warn" : "info";
    items.push({ id: `registry:${r.id}`, kind: "registry", caseId: r.case_id, company: r.company, at: r.at, pending: !viewedAfter(r.case_id, r.at), detail: labels.join(" · ") || null, tone });
  }
  for (const d of input.needsReview) {
    items.push({ id: `review:${d.id}`, kind: "needs_review", caseId: d.case_id, company: d.company, at: d.uploaded_at, pending: true, detail: d.kind });
  }
  items.sort((a, b) => Number(b.pending) - Number(a.pending) || b.at.localeCompare(a.at));
  return { items, pendingCount: items.filter((i) => i.pending).length };
}
