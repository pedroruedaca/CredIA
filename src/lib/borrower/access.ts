/**
 * Resolves a borrower magic-link token (the company's own link, or a gestoría delegate link) to its case.
 * Server-only: uses the service-role client, so every borrower route must go through here first.
 * The raw token is hashed immediately and never logged.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "../magic-link.ts";
import { createAdminClient } from "../supabase/admin.ts";

export interface BorrowerCase {
  id: string;
  lender_id: string;
  lender_name: string;
  borrower_name: string | null;
  borrower_cif: string;
  status: string;
  fiscal_year_end: string | null;
  requested_product: string | null;
  borrower_token_expires_at: string | null;
  submitted_at: string | null;
  consent_withdrawn_at: string | null;
}

export type BorrowerAccess =
  | { ok: true; db: SupabaseClient; kase: BorrowerCase; actor: "borrower" | "delegate"; delegateId: string | null }
  | { ok: false; reason: "invalid" | "expired" };

const CASE_COLUMNS =
  "id, lender_id, borrower_name, borrower_cif, status, fiscal_year_end, requested_product, borrower_token_expires_at, submitted_at, consent_withdrawn_at, lenders(name)";

/** Tokens are 43-char base64url; reject anything else before hashing or querying. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;

type CaseRow = Omit<BorrowerCase, "lender_name"> & { lenders: { name: string } | { name: string }[] | null };

function toCase(row: CaseRow): BorrowerCase {
  const { lenders, ...rest } = row;
  const lender = Array.isArray(lenders) ? lenders[0] : lenders;
  return { ...rest, lender_name: lender?.name ?? "la entidad" };
}

const expired = (iso: string | null, now: Date) => !!iso && new Date(iso) <= now;

export async function resolveBorrowerToken(token: string, now = new Date()): Promise<BorrowerAccess> {
  if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: "invalid" };
  const db = createAdminClient();
  const hash = hashToken(token);

  const { data: own } = await db.from("cases").select(CASE_COLUMNS).eq("borrower_token_hash", hash).maybeSingle();
  if (own) {
    const kase = toCase(own as unknown as CaseRow);
    if (kase.status === "archived") return { ok: false, reason: "invalid" };
    if (expired(kase.borrower_token_expires_at, now)) return { ok: false, reason: "expired" };
    return { ok: true, db, kase, actor: "borrower", delegateId: null };
  }

  const { data: delegate } = await db
    .from("case_delegates")
    .select("id, case_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!delegate || delegate.revoked_at) return { ok: false, reason: "invalid" };
  if (expired(delegate.expires_at, now)) return { ok: false, reason: "expired" };

  const { data: row } = await db.from("cases").select(CASE_COLUMNS).eq("id", delegate.case_id).maybeSingle();
  if (!row) return { ok: false, reason: "invalid" };
  const kase = toCase(row as unknown as CaseRow);
  if (kase.status === "archived") return { ok: false, reason: "invalid" };
  if (expired(kase.borrower_token_expires_at, now)) return { ok: false, reason: "expired" };
  return { ok: true, db, kase, actor: "delegate", delegateId: delegate.id };
}

export async function borrowerAudit(
  access: Extract<BorrowerAccess, { ok: true }>,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await access.db.from("audit_log").insert({
    lender_id: access.kase.lender_id,
    case_id: access.kase.id,
    actor: access.actor,
    action,
    detail: access.delegateId ? { ...detail, delegate_id: access.delegateId } : detail,
  });
}

/** Rows the checklist needs, newest first. */
export async function loadChecklistRows(db: SupabaseClient, caseId: string) {
  const [reqs, docs, holded] = await Promise.all([
    db.from("case_requirements").select("doc_kind, required, max_age_days").eq("case_id", caseId),
    db
      .from("documents")
      .select("id, kind, status, original_name, issued_on, status_message, uploaded_at")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false }),
    db
      .from("holded_connections")
      .select("status, mode, last_sync_at, revoked_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);
  const error = reqs.error ?? docs.error ?? holded.error;
  return {
    error,
    requirements: reqs.data ?? [],
    documents: docs.data ?? [],
    holded: holded.data ?? [],
  };
}
