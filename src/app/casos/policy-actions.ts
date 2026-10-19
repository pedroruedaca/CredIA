"use server";

/** Applying one of the lender's credit policies to a case (or none). Owners and analysts; viewers see the result only. */
import { revalidatePath } from "next/cache";
import { requireLender } from "@/lib/lender";
import { parseCaseParameterFields } from "@/lib/policies/parameters";
import { listParameters } from "@/lib/policies/parameter-store";
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

/**
 * The case's values of the lender's parameters («Política» panel), posted as `param_<id>`: a number sets it, an empty
 * field removes it. Owners and analysts; the database checks the role and that each parameter is this lender's.
 */
export async function saveCaseParameters(caseId: string, posted: Record<string, string>): Promise<PolicyActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId) || typeof posted !== "object" || posted === null) return { ok: false, message: "Caso no encontrado." };
  const supabase = await createClient();
  const params = await listParameters(supabase);
  const fields: Record<string, string> = {};
  for (const p of params) if (typeof posted[`param_${p.id}`] === "string") fields[`param_${p.id}`] = posted[`param_${p.id}`];
  const parsed = parseCaseParameterFields(fields, params);
  if (!parsed.ok) return { ok: false, message: Object.values(parsed.errors)[0] ?? "Revisa los valores." };

  const set = parsed.values.filter((v): v is { parameterId: string; value: number } => v.value !== null);
  const cleared = parsed.values.filter((v) => v.value === null).map((v) => v.parameterId);
  const now = new Date().toISOString();
  if (set.length) {
    const { error } = await supabase
      .from("case_parameter_values")
      .upsert(set.map((v) => ({ case_id: caseId, lender_id: lender.lenderId, parameter_id: v.parameterId, value: v.value, updated_by: lender.userId, updated_at: now })), { onConflict: "case_id,parameter_id" });
    if (error) return { ok: false, message: "No hemos podido guardar los valores. Inténtalo de nuevo." };
  }
  if (cleared.length) {
    const { error } = await supabase.from("case_parameter_values").delete().eq("case_id", caseId).in("parameter_id", cleared);
    if (error) return { ok: false, message: "No hemos podido quitar los valores vaciados. Inténtalo de nuevo." };
  }
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: "case_parameters.saved",
    detail: { set: set.map((v) => ({ parameter_id: v.parameterId, value: v.value })), cleared },
  });
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}
