"use server";

/** Saving and resetting the team's case-view layout (modules, order, width). Owners and analysts; viewers cannot. */
import { revalidatePath } from "next/cache";
import { normalizeLayout } from "@/lib/case-view/modules";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type LayoutActionResult = { ok: true } | { ok: false; message: string };

export async function saveTeamLayout(raw: unknown): Promise<LayoutActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  // Whatever arrives is normalised: unknown modules dropped, allowed widths, «Para revisar» always present.
  const layout = normalizeLayout(raw);
  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_layouts")
    .upsert({ lender_id: lender.lenderId, scope: "team", layout, updated_by: lender.userId, updated_at: new Date().toISOString() }, { onConflict: "lender_id,scope" });
  if (error) return { ok: false, message: "No hemos podido guardar el diseño. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    actor: lender.userId,
    action: "layout.saved",
    detail: { scope: "team", modules: layout.modules.map((m) => `${m.id}:${m.width}`) },
  });
  revalidatePath("/casos", "layout");
  return { ok: true };
}

/** Back to the default layout for the whole team (the saved one is deleted). */
export async function resetTeamLayout(): Promise<LayoutActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const supabase = await createClient();
  const { error } = await supabase.from("dashboard_layouts").delete().eq("lender_id", lender.lenderId).eq("scope", "team");
  if (error) return { ok: false, message: "No hemos podido restaurar el diseño. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, actor: lender.userId, action: "layout.reset", detail: { scope: "team" } });
  revalidatePath("/casos", "layout");
  return { ok: true };
}
