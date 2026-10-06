"use server";

/**
 * Saving and resetting a case-view layout (modules, order, width) for one of three targets: the team, a template, or
 * one case. Owners and analysts; viewers cannot. Whatever arrives is normalised (unknown modules dropped, allowed
 * widths, «Para revisar» always present). A case draws its own layout, else its template's, else the team's.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { moduleKey, normalizeLayout } from "@/lib/case-view/modules";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type LayoutActionResult = { ok: true } | { ok: false; message: string };

const Id = z.string().regex(/^[0-9a-f-]{36}$/i);
const Target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("team") }),
  z.object({ kind: z.literal("template"), id: Id }),
  z.object({ kind: z.literal("case"), id: Id }),
]);
export type LayoutTarget = z.infer<typeof Target>;

async function editor() {
  const lender = await requireLender();
  return lender.role === "viewer" ? null : lender;
}

/** Saves the layout for the target. */
export async function saveLayout(target: LayoutTarget, raw: unknown): Promise<LayoutActionResult> {
  const lender = await editor();
  if (!lender) return { ok: false, message: "Tu rol solo permite consultar casos." };
  const t = Target.safeParse(target);
  if (!t.success) return { ok: false, message: "Datos no válidos." };
  const layout = normalizeLayout(raw);
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } =
    t.data.kind === "team"
      ? await supabase.from("dashboard_layouts").upsert({ lender_id: lender.lenderId, scope: "team", layout, updated_by: lender.userId, updated_at: now }, { onConflict: "lender_id,scope" }).select("id")
      : t.data.kind === "template"
        ? await supabase.from("case_templates").update({ layout, updated_by: lender.userId, updated_at: now }).eq("id", t.data.id).select("id")
        : await supabase.from("cases").update({ layout }).eq("id", t.data.id).select("id");
  if (error || !data?.length) return { ok: false, message: "No hemos podido guardar el diseño. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: t.data.kind === "case" ? t.data.id : null,
    actor: lender.userId,
    action: "layout.saved",
    detail: { scope: t.data.kind, ...(t.data.kind === "template" ? { template_id: t.data.id } : {}), modules: layout.modules.map((m) => `${moduleKey(m)}:${m.width}`) },
  });
  revalidatePath("/casos", "layout");
  revalidatePath("/plantillas", "layout");
  return { ok: true };
}

/**
 * Removes the target's own layout: the team goes back to the original, a template back to the team's, a case back to
 * its template's (or the team's).
 */
export async function resetLayout(target: LayoutTarget): Promise<LayoutActionResult> {
  const lender = await editor();
  if (!lender) return { ok: false, message: "Tu rol solo permite consultar casos." };
  const t = Target.safeParse(target);
  if (!t.success) return { ok: false, message: "Datos no válidos." };
  const supabase = await createClient();
  const { error } =
    t.data.kind === "team"
      ? await supabase.from("dashboard_layouts").delete().eq("lender_id", lender.lenderId).eq("scope", "team")
      : t.data.kind === "template"
        ? await supabase.from("case_templates").update({ layout: null }).eq("id", t.data.id)
        : await supabase.from("cases").update({ layout: null }).eq("id", t.data.id);
  if (error) return { ok: false, message: "No hemos podido restaurar el diseño. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: t.data.kind === "case" ? t.data.id : null,
    actor: lender.userId,
    action: "layout.reset",
    detail: { scope: t.data.kind, ...(t.data.kind === "template" ? { template_id: t.data.id } : {}) },
  });
  revalidatePath("/casos", "layout");
  revalidatePath("/plantillas", "layout");
  return { ok: true };
}
