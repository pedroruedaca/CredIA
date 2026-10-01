/** The team's case-view layout (dashboard_layouts, migration 0018), read through the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LAYOUT, normalizeLayout, resolveCaseLayout, type Layout } from "./modules.ts";

/** The lender's team layout, normalised; the default when none is saved (or it cannot be read). */
export async function loadTeamLayout(db: SupabaseClient, lenderId: string): Promise<{ layout: Layout; custom: boolean }> {
  const { data } = await db.from("dashboard_layouts").select("layout").eq("lender_id", lenderId).eq("scope", "team").maybeSingle();
  return data ? { layout: normalizeLayout(data.layout), custom: true } : { layout: DEFAULT_LAYOUT, custom: false };
}

/**
 * The layout a case draws and where it comes from: its own, else its template's, else the team's, else the original.
 * Also what exists at each level, so the editor can offer "save for…" and "go back to…".
 */
export async function loadCaseLayout(db: SupabaseClient, caseId: string, lenderId: string) {
  const [{ data: c }, team] = await Promise.all([
    db.from("cases").select("layout, template_id, case_templates(id, name, layout)").eq("id", caseId).maybeSingle(),
    db.from("dashboard_layouts").select("layout").eq("lender_id", lenderId).eq("scope", "team").maybeSingle(),
  ]);
  const tpl = (c?.case_templates ?? null) as { id: string; name: string; layout: unknown } | null;
  const resolved = resolveCaseLayout({ caseLayout: c?.layout, templateLayout: tpl?.layout, teamLayout: team.data?.layout });
  return {
    ...resolved,
    template: tpl ? { id: tpl.id, name: tpl.name, hasLayout: !!tpl.layout } : null,
    caseHasLayout: !!c?.layout,
    teamHasLayout: !!team.data?.layout,
  };
}
