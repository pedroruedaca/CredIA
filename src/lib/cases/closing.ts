/**
 * Closing a case and the lender's retention period (0025). Pure.
 *
 * A case ends when the analyst closes it («Cerrar caso»: decided, declined or withdrawn) or, when the lender wants,
 * after `auto_close_months` with no activity from a person (reason `inactive`, the daily cron). Closed =
 * `status = 'archived'` + `closed_at`. The lender keeps a closed case for `retention_months` (Ajustes); then the daily
 * cron deletes it, after announcing the date at least PURGE_NOTICE_DAYS before (`purgeStep`, 0026).
 */

export const CLOSE_REASONS = ["decided", "declined", "withdrawn"] as const;
/** What the analyst picks; `inactive` is only set by the daily cron. */
export type CloseReason = (typeof CLOSE_REASONS)[number];
export type ClosedReason = CloseReason | "inactive";

export const DEFAULT_RETENTION_MONTHS = 12;
export const DEFAULT_AUTO_CLOSE_MONTHS = 6;
/** Choices offered in Ajustes (the database accepts 1–120 and 1–36). */
export const RETENTION_OPTIONS = [6, 12, 24, 36, 60, 120] as const;
export const AUTO_CLOSE_OPTIONS = [3, 6, 12] as const;

export const isCloseReason = (v: unknown): v is CloseReason => typeof v === "string" && (CLOSE_REASONS as readonly string[]).includes(v);

/**
 * `iso` plus `months` calendar months, as a date (YYYY-MM-DD, UTC). A day the target month lacks becomes its last day
 * (31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

/** The day a closed case is due for deletion: its closing date plus the lender's retention period. */
export const retentionEndsOn = (closedAt: string, retentionMonths: number) => addMonths(closedAt, retentionMonths);

/** Days between the warning (Bandeja + email to owners) and the deletion. */
export const PURGE_NOTICE_DAYS = 14;

/** `date` (YYYY-MM-DD) plus `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PurgeState {
  closedAt: string;
  retentionMonths: number;
  /** When the deletion was announced, and the date announced (0026); null before any warning. */
  warnedAt: string | null;
  warnedFor: string | null;
}

export type PurgeStep = { step: "none" } | { step: "warn"; purgeOn: string } | { step: "purge"; purgeOn: string };

/**
 * What the daily cron does with a closed case today.
 * - The announcement counts only if it was made for this closing (after `closedAt`) and is not earlier than the due
 *   date (the lender may have lengthened the period since). Otherwise the case is warned again once the due date is
 *   PURGE_NOTICE_DAYS away; the date announced is never sooner than that many days from the warning.
 * - A valid announcement is kept even if the lender shortened the period since: the date promised stands.
 * - Deletion happens only on or after the announced date.
 */
export function purgeStep(s: PurgeState, now = new Date()): PurgeStep {
  const today = now.toISOString().slice(0, 10);
  const due = retentionEndsOn(s.closedAt, s.retentionMonths);
  const warnedFor = s.warnedFor?.slice(0, 10) ?? null;
  const forThisClosing = !!s.warnedAt && new Date(s.warnedAt).getTime() >= new Date(s.closedAt).getTime();
  const announced = forThisClosing && warnedFor && warnedFor >= due ? warnedFor : null;
  if (announced) return today >= announced ? { step: "purge", purgeOn: announced } : { step: "none" };
  if (today < addDays(due, -PURGE_NOTICE_DAYS)) return { step: "none" };
  const earliest = addDays(today, PURGE_NOTICE_DAYS);
  return { step: "warn", purgeOn: due > earliest ? due : earliest };
}

/** For display: the deletion date of a closed case, and whether it has already been announced to the lender. */
export function scheduledDeletion(s: PurgeState): { date: string; announced: boolean } {
  const due = retentionEndsOn(s.closedAt, s.retentionMonths);
  const forThisClosing = !!s.warnedAt && new Date(s.warnedAt).getTime() >= new Date(s.closedAt).getTime();
  const warnedFor = s.warnedFor?.slice(0, 10) ?? null;
  return forThisClosing && warnedFor && warnedFor >= due ? { date: warnedFor, announced: true } : { date: due, announced: false };
}

/** The row update that closes a case. */
export function closeUpdate(reason: ClosedReason, now = new Date()) {
  return { status: "archived" as const, closed_at: now.toISOString(), closed_reason: reason };
}

/**
 * Status a reopened case goes back to: a submitted case is processed again (the pipeline then sets ready or
 * needs_review); anything else waits for documents again.
 */
export function reopenUpdate(submittedAt: string | null) {
  return { status: submittedAt ? ("processing" as const) : ("awaiting_documents" as const), closed_at: null, closed_reason: null };
}

export interface OpenCaseActivity {
  case_id: string;
  lender_id: string;
  auto_close_months: number | null;
  last_activity: string;
}

/** Open cases with no activity from a person for the lender's `auto_close_months` (none when the lender turned it off). */
export function inactiveCases(rows: OpenCaseActivity[], now = new Date()): OpenCaseActivity[] {
  const today = now.toISOString().slice(0, 10);
  return rows.filter((r) => r.auto_close_months !== null && r.auto_close_months > 0 && addMonths(r.last_activity, r.auto_close_months) <= today);
}

/** Ajustes form values → the two lender columns, or the message to show. */
export function parseRetentionInput(input: { retentionMonths: unknown; autoCloseMonths: unknown }):
  | { ok: true; retention_months: number; auto_close_months: number | null }
  | { ok: false; message: string } {
  const retention = Number(input.retentionMonths);
  if (!(RETENTION_OPTIONS as readonly number[]).includes(retention)) return { ok: false, message: "Elige un plazo de conservación." };
  const raw = input.autoCloseMonths;
  if (raw === null || raw === "" || raw === "never") return { ok: true, retention_months: retention, auto_close_months: null };
  const auto = Number(raw);
  if (!(AUTO_CLOSE_OPTIONS as readonly number[]).includes(auto)) return { ok: false, message: "Elige cuándo cerrar los casos sin actividad." };
  return { ok: true, retention_months: retention, auto_close_months: auto };
}
