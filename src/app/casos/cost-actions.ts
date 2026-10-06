"use server";

/**
 * Saving and removing a case's cost-of-sales definition (adjusted gross margin). Owners and analysts; viewers cannot.
 * Whatever arrives is normalised; the adjusted margin is computed when the case is read, so it changes at once.
 */
import { revalidatePath } from "next/cache";
import { normalizeCostDefinition } from "@/lib/kpis/cost-of-sales";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type CostActionResult = { ok: true } | { ok: false; message: string };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function saveCostOfSales(caseId: string, raw: unknown): Promise<CostActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId)) return { ok: false, message: "Caso no encontrado." };
  const def = normalizeCostDefinition(raw);
  if (!def) return { ok: false, message: "Marca al menos un coste." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_cost_definitions")
    .upsert(
      { case_id: caseId, lender_id: lender.lenderId, preset: def.preset, selectors: def.selectors, source: "analyst", updated_by: lender.userId, updated_at: new Date().toISOString() },
      { onConflict: "case_id" },
    )
    .select("id");
  if (error || !data?.length) return { ok: false, message: "No hemos podido guardar el coste de ventas. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: "cost_of_sales.saved",
    detail: { preset: def.preset, selectors: def.selectors },
  });
  revalidatePath(`/casos/${caseId}`, "layout");
  return { ok: true };
}

/** Removes the definition: the case is left with the accounting gross margin only. */
export async function resetCostOfSales(caseId: string): Promise<CostActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!isId(caseId)) return { ok: false, message: "Caso no encontrado." };
  const supabase = await createClient();
  const { error } = await supabase.from("case_cost_definitions").delete().eq("case_id", caseId);
  if (error) return { ok: false, message: "No hemos podido quitar el coste de ventas. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, case_id: caseId, actor: lender.userId, action: "cost_of_sales.reset", detail: {} });
  revalidatePath(`/casos/${caseId}`, "layout");
  return { ok: true };
}
