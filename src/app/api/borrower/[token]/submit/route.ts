/**
 * POST /api/borrower/:token/submit
 * "Enviar documentación": allowed only when every required item is done (recomputed here, never trusted from
 * the client). Moves the case to `processing`.
 */
import { NextResponse } from "next/server";
import { borrowerAudit, loadChecklistRows } from "@/lib/borrower/access";
import { buildChecklist } from "@/lib/borrower/checklist";
import { borrowerAccess, fail } from "@/lib/borrower/http";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const access = await borrowerAccess(token);
  if (access instanceof NextResponse) return access;
  const { db, kase } = access;

  const rows = await loadChecklistRows(db, kase.id);
  if (rows.error) return fail(500, "No hemos podido comprobar la documentación. Inténtalo de nuevo.");
  const checklist = buildChecklist(rows.requirements, rows.documents, rows.holded, kase.lender_name);
  if (!checklist.canSubmit) {
    return fail(409, "Aún faltan documentos obligatorios.", { done: checklist.done, total: checklist.total });
  }

  const submittedAt = new Date().toISOString();
  const update: Record<string, unknown> = { submitted_at: submittedAt };
  if (kase.status === "awaiting_documents") update.status = "processing";
  const { error } = await db.from("cases").update(update).eq("id", kase.id);
  if (error) return fail(500, "No hemos podido enviar la documentación. Inténtalo de nuevo.");

  await borrowerAudit(access, "case.submitted", { done: checklist.done, total: checklist.total });
  return NextResponse.json({ ok: true, submittedAt });
}
