/**
 * DELETE /api/borrower/:token/consent
 * "Retirar consentimiento": stops further sharing for this case. Deletes stored Holded keys, revokes gestoría
 * links and blocks new uploads. The lender sees the withdrawal in the audit log. Only the company can do this.
 * Deleting data already shared is a retention decision for the lender and is not done here.
 */
import { NextResponse } from "next/server";
import { borrowerAudit } from "@/lib/borrower/access";
import { borrowerAccess, fail } from "@/lib/borrower/http";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const access = await borrowerAccess(token, { write: false });
  if (access instanceof NextResponse) return access;
  if (access.actor !== "borrower") return fail(403, "Solo la empresa puede retirar el consentimiento.");
  const { db, kase } = access;
  if (kase.consent_withdrawn_at) return NextResponse.json({ ok: true, withdrawnAt: kase.consent_withdrawn_at });

  const now = new Date().toISOString();
  const [c, h, d] = await Promise.all([
    db.from("cases").update({ consent_withdrawn_at: now }).eq("id", kase.id),
    db
      .from("holded_connections")
      .update({ token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: now })
      .eq("case_id", kase.id)
      .is("revoked_at", null),
    db.from("case_delegates").update({ revoked_at: now }).eq("case_id", kase.id).is("revoked_at", null),
  ]);
  if (c.error || h.error || d.error) return fail(500, "No hemos podido registrar tu decisión. Inténtalo de nuevo.");

  await borrowerAudit(access, "consent.withdrawn", {});
  return NextResponse.json({ ok: true, withdrawnAt: now });
}
