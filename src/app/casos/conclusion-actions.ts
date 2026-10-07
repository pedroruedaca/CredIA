"use server";

/**
 * The analysts' conclusions (case_conclusions, 0022): saved from an answer of «Preguntar al caso», optionally edited,
 * and shown in the case view, the committee PDF and the Excel/JSON exports. Owners and analysts; viewers cannot.
 * The answer is read back from the analyst's own thread (RLS), so its citations come from the server, not the browser.
 */
import { revalidatePath } from "next/cache";
import { prepareConclusion } from "@/lib/analyst-chat/conclusions";
import { parseCitations } from "@/lib/analyst-chat/refs";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type ConclusionActionResult = { ok: true } | { ok: false; message: string };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function saveConclusion(caseId: string, messageId: number, editedText?: string): Promise<ConclusionActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId) || !Number.isSafeInteger(messageId)) return { ok: false, message: "Respuesta no encontrada." };
  if (editedText !== undefined && typeof editedText !== "string") return { ok: false, message: "Escribe la conclusión." };
  const supabase = await createClient();
  const { data: answer } = await supabase
    .from("analyst_messages")
    .select("id, content, citations")
    .eq("id", messageId)
    .eq("case_id", caseId)
    .eq("user_id", lender.userId)
    .eq("role", "assistant")
    .maybeSingle();
  if (!answer) return { ok: false, message: "Respuesta no encontrada." };
  const { data: question } = await supabase
    .from("analyst_messages")
    .select("content")
    .eq("case_id", caseId)
    .eq("user_id", lender.userId)
    .eq("role", "user")
    .lt("id", messageId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prepared = prepareConclusion(editedText ?? (answer.content as string), parseCitations(answer.citations));
  if (!prepared.ok) {
    return {
      ok: false,
      message:
        prepared.reason === "uncited" ? `Hay cifras sin origen: «${prepared.uncited![0].slice(0, 120)}». Quítalas o vuelve a preguntar para que lleven su fuente.`
        : prepared.reason === "too_long" ? "La conclusión es demasiado larga (máximo 4.000 caracteres)."
        : "Escribe la conclusión.",
    };
  }
  const { error } = await supabase.from("case_conclusions").insert({
    case_id: caseId,
    lender_id: lender.lenderId,
    text: prepared.text,
    citations: prepared.citations,
    question: (question?.content as string | undefined)?.slice(0, 1000) ?? null,
    created_by: lender.userId,
  });
  if (error) return { ok: false, message: "No hemos podido guardar la conclusión. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, case_id: caseId, actor: lender.userId, action: "conclusion.saved", detail: { message_id: messageId, edited: editedText !== undefined, citations: prepared.citations.length } });
  revalidatePath(`/casos/${caseId}`, "layout");
  return { ok: true };
}

export async function removeConclusion(caseId: string, conclusionId: string): Promise<ConclusionActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId) || !isId(conclusionId)) return { ok: false, message: "Conclusión no encontrada." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("case_conclusions").delete().eq("id", conclusionId).eq("case_id", caseId).select("id");
  if (error || !data?.length) return { ok: false, message: "No hemos podido quitar la conclusión. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, case_id: caseId, actor: lender.userId, action: "conclusion.removed", detail: { conclusion_id: conclusionId } });
  revalidatePath(`/casos/${caseId}`, "layout");
  return { ok: true };
}
