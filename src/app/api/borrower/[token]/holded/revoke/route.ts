/**
 * POST /api/borrower/:token/holded/revoke — "Revocar acceso".
 * Destroys any stored (refresh-mode) Holded key for the case. Data already imported stays with the case.
 */
import { NextResponse } from "next/server";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;

  const { data, error } = await db
    .from("holded_connections")
    .update({ token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: new Date().toISOString() })
    .eq("case_id", access.caseId)
    .eq("mode", "refresh")
    .is("revoked_at", null)
    .select("id");
  if (error) return jsonError("No hemos podido revocar el acceso. Inténtalo de nuevo.", 500);

  if (data?.length) await audit(db, access, "holded.token_deleted", { connections: data.map((c) => c.id) });
  return NextResponse.json({ ok: true, revoked: data?.length ?? 0 });
}
