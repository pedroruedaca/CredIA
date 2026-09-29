/**
 * POST /api/borrower/:token/support — "Hablar con una persona".
 * Records a support request and notifies the lender, who follows up with the company by email.
 * One open request per link holder per day is enough: repeats return ok without notifying again.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { getNotifier } from "@/lib/notify";

export const runtime = "nodejs";

const body = z.object({ message: z.string().trim().max(2000).optional() });
const DEDUPE_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("Solicitud no válida.", 400);

  let q = db
    .from("support_requests")
    .select("id")
    .eq("case_id", access.caseId)
    .eq("status", "open")
    .gt("created_at", new Date(Date.now() - DEDUPE_MS).toISOString());
  q = access.delegateId ? q.eq("delegate_link_id", access.delegateId) : q.is("delegate_link_id", null);
  const { data: open } = await q.limit(1);
  if (open?.length) return NextResponse.json({ ok: true, alreadyRequested: true });

  const { data: created, error } = await db
    .from("support_requests")
    .insert({
      case_id: access.caseId,
      lender_id: access.lenderId,
      delegate_link_id: access.delegateId,
      actor: access.actor,
      message: parsed.data.message || null,
    })
    .select("id")
    .single();
  if (error || !created) return jsonError("No hemos podido enviar el aviso. Inténtalo de nuevo.", 500);

  await audit(db, access, "support.requested", { support_request_id: created.id });
  const portal = await loadPortal(db, access);
  await getNotifier().notifyLender({
    lenderId: access.lenderId,
    caseId: access.caseId,
    companyName: portal?.kase.companyName ?? "",
    event: "support_requested",
  });
  return NextResponse.json({ ok: true });
}
