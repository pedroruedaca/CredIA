/**
 * POST /api/borrower/:token/consent — "Retirar consentimiento" (company's own link only).
 * Stops any further sharing: no more uploads or Holded syncs, stored Holded keys are destroyed and
 * gestoría links revoked. Documents already shared stay with the case; deletion requests go to the lender.
 */
import { NextResponse } from "next/server";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";
import { getNotifier } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;
  if (access.actor !== "borrower") return jsonError("Solo la empresa puede retirar el consentimiento.", 403);

  const now = new Date().toISOString();
  const { data: kase, error } = await db
    .from("cases")
    .update({ consent_withdrawn_at: now })
    .eq("id", access.caseId)
    .is("consent_withdrawn_at", null)
    .select("borrower_name")
    .maybeSingle();
  if (error) return jsonError("No hemos podido registrar tu decisión. Inténtalo de nuevo.", 500);
  if (!kase) return NextResponse.json({ ok: true });

  const { data: keys } = await db
    .from("holded_connections")
    .update({ token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: now })
    .eq("case_id", access.caseId)
    .is("revoked_at", null)
    .select("id");
  await db.from("delegate_links").update({ revoked_at: now }).eq("case_id", access.caseId).is("revoked_at", null);

  await audit(db, access, "consent.withdrawn", { holded_connections_revoked: keys?.length ?? 0 });
  await getNotifier().notifyLender({
    lenderId: access.lenderId,
    caseId: access.caseId,
    companyName: kase.borrower_name ?? "",
    event: "consent_withdrawn",
  });
  return NextResponse.json({ ok: true });
}
