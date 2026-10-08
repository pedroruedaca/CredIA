/**
 * Borrower-side access by magic-link token (the company's own link or a gestoría delegate link).
 * Server-only: uses the service-role client, so every caller must go through `resolveBorrowerAccess`.
 */
import "server-only";
import { NextResponse } from "next/server";
import { hashToken, isPlausibleToken, linkState } from "../magic-link.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { linkToken } from "./link-session.ts";

export type AdminClient = ReturnType<typeof createAdminClient>;
export type BorrowerActor = "borrower" | "delegate";

export interface BorrowerAccess {
  caseId: string;
  lenderId: string;
  actor: BorrowerActor;
  delegateId: string | null;
  delegateEmail: string | null;
  linkExpiresAt: string | null;
  consentWithdrawn: boolean;
}

export type AccessResult = { ok: true; access: BorrowerAccess } | { ok: false; reason: "invalid" | "expired" };

export async function resolveBorrowerAccess(db: AdminClient, token: string, now = new Date()): Promise<AccessResult> {
  if (!isPlausibleToken(token)) return { ok: false, reason: "invalid" };
  const hash = hashToken(token);

  const { data: kase } = await db
    .from("cases")
    .select("id, lender_id, borrower_token_expires_at, consent_withdrawn_at, status")
    .eq("borrower_token_hash", hash)
    .maybeSingle();
  if (kase) {
    if (kase.status === "archived") return { ok: false, reason: "expired" };
    if (linkState({ expiresAt: kase.borrower_token_expires_at }, now) !== "valid") return { ok: false, reason: "expired" };
    return {
      ok: true,
      access: {
        caseId: kase.id,
        lenderId: kase.lender_id,
        actor: "borrower",
        delegateId: null,
        delegateEmail: null,
        linkExpiresAt: kase.borrower_token_expires_at,
        consentWithdrawn: kase.consent_withdrawn_at !== null,
      },
    };
  }

  const { data: link } = await db
    .from("delegate_links")
    .select("id, case_id, lender_id, email, expires_at, revoked_at, cases(status, consent_withdrawn_at)")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!link) return { ok: false, reason: "invalid" };
  const parent = link.cases as unknown as { status: string; consent_withdrawn_at: string | null } | null;
  if (!parent || parent.status === "archived") return { ok: false, reason: "expired" };
  if (linkState({ expiresAt: link.expires_at, revokedAt: link.revoked_at }, now) !== "valid") return { ok: false, reason: "expired" };
  return {
    ok: true,
    access: {
      caseId: link.case_id,
      lenderId: link.lender_id,
      actor: "delegate",
      delegateId: link.id,
      delegateEmail: link.email,
      linkExpiresAt: link.expires_at,
      consentWithdrawn: parent.consent_withdrawn_at !== null,
    },
  };
}

export async function audit(db: AdminClient, access: BorrowerAccess, action: string, detail: Record<string, unknown> = {}) {
  const extra = access.delegateId ? { delegate_link_id: access.delegateId } : {};
  await db.from("audit_log").insert({
    lender_id: access.lenderId,
    case_id: access.caseId,
    actor: access.actor,
    action,
    detail: { ...extra, ...detail },
  });
}

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Common preamble for borrower API routes: resolves the link (`segment` is the URL's handle, read with its cookie) and
 * refuses once consent is withdrawn. Returns either the access or the response to send.
 */
export async function borrowerRoute(
  segment: string,
): Promise<{ db: AdminClient; access: BorrowerAccess; response?: undefined } | { response: NextResponse }> {
  const token = await linkToken(segment);
  if (!token) return { response: jsonError("Este enlace no es válido o ha caducado.", 404) };
  const db = createAdminClient();
  const res = await resolveBorrowerAccess(db, token);
  if (!res.ok) return { response: jsonError("Este enlace no es válido o ha caducado.", 404) };
  if (res.access.consentWithdrawn) {
    return { response: jsonError("Has retirado tu consentimiento: ya no se pueden aportar documentos a esta solicitud.", 409) };
  }
  return { db, access: res.access };
}
