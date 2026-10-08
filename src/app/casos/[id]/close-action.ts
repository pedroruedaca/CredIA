"use server";

/**
 * «Cerrar caso» / «Reabrir caso» (owners and analysts). The case row is written through the analyst's own session,
 * so the database checks the role (0023) and the columns (0024/0025). Closing stops the company's and the gestoría's
 * links (resolveBorrowerAccess refuses archived cases) and destroys stored Holded keys (service role: clients cannot
 * write holded_connections). Reopening a submitted case processes it again.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { closeUpdate, isCloseReason, reopenUpdate } from "@/lib/cases/closing";
import { destroyStoredHoldedKeys } from "@/lib/cases/close-store";
import { requireLender } from "@/lib/lender";
import { processCase } from "@/lib/pipeline/process-case";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CloseResult = { ok: true } | { ok: false; message: string };

const CaseId = /^[0-9a-f-]{36}$/i;
const VIEWER = "Tu rol solo permite consultar casos.";

export async function closeCase(caseId: string, reason: string): Promise<CloseResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: VIEWER };
  if (typeof caseId !== "string" || !CaseId.test(caseId) || !isCloseReason(reason)) return { ok: false, message: "Datos no válidos." };

  const supabase = await createClient();
  const now = new Date();
  const { data: kase, error } = await supabase.from("cases").update(closeUpdate(reason, now)).eq("id", caseId).neq("status", "archived").select("id, lender_id").maybeSingle();
  if (error) return { ok: false, message: "No hemos podido cerrar el caso. Inténtalo de nuevo." };
  if (!kase) return { ok: false, message: "El caso no existe o ya está cerrado." };

  const keys = await destroyStoredHoldedKeys(createAdminClient(), caseId, now);
  await supabase.from("audit_log").insert({
    lender_id: kase.lender_id,
    case_id: caseId,
    actor: lender.userId,
    action: "case.closed",
    detail: { reason, holded_keys_destroyed: keys },
  });
  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/casos");
  return { ok: true };
}

export async function reopenCase(caseId: string): Promise<CloseResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: VIEWER };
  if (typeof caseId !== "string" || !CaseId.test(caseId)) return { ok: false, message: "Datos no válidos." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("cases").select("id, lender_id, status, submitted_at, closed_reason").eq("id", caseId).maybeSingle();
  if (!current) return { ok: false, message: "Caso no encontrado." };
  if (current.status !== "archived") return { ok: true };

  const update = reopenUpdate(current.submitted_at);
  const { data: rows, error } = await supabase.from("cases").update(update).eq("id", caseId).eq("status", "archived").select("id");
  if (error || !rows?.length) return { ok: false, message: "No hemos podido reabrir el caso. Inténtalo de nuevo." };

  await supabase.from("audit_log").insert({
    lender_id: current.lender_id,
    case_id: caseId,
    actor: lender.userId,
    action: "case.reopened",
    detail: { was: current.closed_reason, status: update.status },
  });
  if (update.status === "processing") {
    const admin = createAdminClient();
    after(() => processCase(admin, caseId));
  }
  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/casos");
  return { ok: true };
}
