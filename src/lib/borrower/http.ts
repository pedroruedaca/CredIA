/** Shared plumbing for borrower API routes: token check, consent gate, Spanish error bodies. */
import "server-only";
import { NextResponse } from "next/server";
import { resolveBorrowerToken, type BorrowerAccess } from "./access.ts";

export type Access = Extract<BorrowerAccess, { ok: true }>;

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

/**
 * Resolves the token and, for write operations, refuses when the company has withdrawn consent.
 * Returns either the access or a ready-to-return error response.
 */
export async function borrowerAccess(token: string, { write = true } = {}): Promise<Access | NextResponse> {
  const access = await resolveBorrowerToken(token);
  if (!access.ok) return fail(404, "Enlace no válido o caducado.");
  if (write && access.kase.consent_withdrawn_at) {
    return fail(403, "Se retiró el consentimiento para esta solicitud. Si quieres retomarla, contacta con la entidad.");
  }
  return access;
}
