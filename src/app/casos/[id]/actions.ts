"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { requireLender } from "@/lib/lender";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const CaseId = z.string().regex(/^[0-9a-f-]{36}$/i);

const ReviewInput = z.object({
  caseId: CaseId,
  checkKey: z.string().regex(/^[A-Za-z0-9_]+(-\d+)?$/).max(80),
  status: z.enum(["open", "reviewed", "clarification_requested"]),
  note: z.string().max(2000).optional(),
});

/** "Marcar revisada" / "Pedir aclaración" / reopen: appends a review row (history kept) and audits it. */
export async function reviewCheck(input: z.input<typeof ReviewInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, checkKey, status } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  const supabase = await createClient();
  // RLS: only returns the case if it belongs to this lender.
  const { data: kase } = await supabase.from("cases").select("id").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };

  const { error } = await supabase.from("check_reviews").insert({ case_id: caseId, lender_id: lender.lenderId, check_key: checkKey, status, note, user_id: lender.userId });
  if (error) return { ok: false, message: "No hemos podido guardar la revisión. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: `check.${status}`,
    detail: { check_key: checkKey, has_note: note !== null },
  });
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}

const RequestInput = z.object({
  caseId: CaseId,
  kind: z.enum(REQUIREMENT_SPECS.map((s) => s.kind) as [string, ...string[]]),
  message: z.string().max(500).optional(),
});

/**
 * "Pedir documento": adds (or makes required) a requirement so it appears in the company's page, reopens the case
 * for documents, and emails the company when an address is on file. No new link is issued.
 */
export async function requestDocument(input: z.input<typeof RequestInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, kind } = parsed.data;
  const message = parsed.data.message?.trim() || null;

  const supabase = await createClient();
  const { data: kase } = await supabase
    .from("cases")
    .select("id, lender_id, status, borrower_name, borrower_email, consent_withdrawn_at")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };
  if (kase.status === "archived") return { ok: false, message: "El caso está archivado." };
  if (kase.consent_withdrawn_at) return { ok: false, message: "La empresa retiró su consentimiento; no se le pueden pedir más documentos." };

  const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
  const { error } = await supabase
    .from("case_requirements")
    .upsert({ case_id: caseId, lender_id: kase.lender_id, doc_kind: kind, required: true, max_age_days: spec.defaultMaxAgeDays }, { onConflict: "case_id,doc_kind" });
  if (error) return { ok: false, message: "No hemos podido añadir el documento. Inténtalo de nuevo." };
  if (kase.status === "ready" || kase.status === "needs_review") {
    await supabase.from("cases").update({ status: "awaiting_documents", submitted_at: null }).eq("id", caseId);
  }
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: "document.requested",
    detail: { doc_kind: kind, message },
  });

  let sent = false;
  if (kase.borrower_email) {
    ({ sent } = await getNotifier().sendDocumentRequest({
      to: kase.borrower_email,
      lenderName: lender.lenderName,
      companyName: kase.borrower_name ?? "",
      document: spec.label,
      message,
    }));
  }
  revalidatePath(`/casos/${caseId}`);
  return {
    ok: true,
    message: sent
      ? `Hemos avisado a la empresa por correo. ${spec.label} ya aparece en su página.`
      : kase.borrower_email && isEmailConfigured()
        ? `${spec.label} ya aparece en la página de la empresa, pero no se ha podido enviar el correo: avísala tú.`
        : `${spec.label} ya aparece en la página de la empresa. No hay correo configurado: avísala tú.`,
  };
}
