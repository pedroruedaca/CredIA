"use server";

/** Applying one of the lender's credit policies to a case (or none). Owners and analysts; viewers see the result only. */
import { revalidatePath } from "next/cache";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type PolicyActionResult = { ok: true } | { ok: false; message: string };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function applyCasePolicy(caseId: string, policyId: string | null): Promise<PolicyActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId) || (policyId !== null && !isId(policyId))) return { ok: false, message: "Caso o política no encontrados." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("cases").update({ policy_id: policyId }).eq("id", caseId).select("id");
  if (error || !data?.length) return { ok: false, message: "No hemos podido aplicar la política. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: policyId ? "policy.applied" : "policy.removed",
    detail: policyId ? { policy_id: policyId } : {},
  });
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}
