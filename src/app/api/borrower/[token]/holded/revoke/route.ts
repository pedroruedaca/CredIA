/**
 * POST /api/borrower/:token/holded/revoke
 * Deletes any stored (refresh-mode) Holded key for the case. Data already imported stays; one-time keys were
 * never stored, so there is nothing to delete for them.
 */
import { NextResponse } from "next/server";
import { borrowerAudit } from "@/lib/borrower/access";
import { borrowerAccess, fail } from "@/lib/borrower/http";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Revoking must work even after consent was withdrawn.
  const access = await borrowerAccess(token, { write: false });
  if (access instanceof NextResponse) return access;

  const { data, error } = await access.db
    .from("holded_connections")
    .update({ token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: new Date().toISOString() })
    .eq("case_id", access.kase.id)
    .is("revoked_at", null)
    .select("id");
  if (error) return fail(500, "No hemos podido revocar el acceso. Inténtalo de nuevo.");

  if (data.length) await borrowerAudit(access, "holded.token_deleted", { connections: data.map((c) => c.id) });
  return NextResponse.json({ ok: true, revoked: data.length });
}
