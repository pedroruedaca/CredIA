/**
 * POST /api/borrower/:link/submit — "Enviar documentación".
 * Recomputes the checklist server-side; only when every required item is done does the case move to
 * `processing`. Idempotent: a case already submitted returns ok.
 */
import { after, NextResponse } from "next/server";
import { processCase } from "@/lib/pipeline/process-case";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { getNotifier } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ link: string }> }) {
  const r = await borrowerRoute((await ctx.params).link);
  if (r.response) return r.response;
  const { db, access } = r;

  const portal = await loadPortal(db, access);
  if (!portal) return jsonError("No hemos podido cargar tu solicitud. Inténtalo de nuevo.", 500);
  if (portal.kase.submittedAt) return NextResponse.json({ ok: true, alreadySubmitted: true });
  if (!portal.checklist.allRequiredDone) {
    return jsonError("Aún faltan documentos obligatorios. Revisa los pasos marcados.", 409);
  }

  const submittedAt = new Date().toISOString();
  const { data: updated, error } = await db
    .from("cases")
    .update({ status: "processing", submitted_at: submittedAt })
    .eq("id", access.caseId)
    .is("submitted_at", null)
    .select("id");
  if (error) return jsonError("No hemos podido enviar la documentación. Inténtalo de nuevo.", 500);
  if (!updated?.length) return NextResponse.json({ ok: true, alreadySubmitted: true });

  await audit(db, access, "case.submitted", { documents_done: portal.checklist.done, documents_total: portal.checklist.total });
  await getNotifier().notifyLender({
    lenderId: access.lenderId,
    caseId: access.caseId,
    companyName: portal.kase.companyName,
    event: "documents_submitted",
  });
  // Marks the case ready once every document is processed.
  after(() => processCase(db, access.caseId));
  return NextResponse.json({ ok: true, submittedAt });
}
