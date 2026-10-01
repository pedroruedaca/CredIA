/** The team's case-view layout (dashboard_layouts, migration 0018), read through the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LAYOUT, normalizeLayout, type Layout } from "./modules.ts";

/** The lender's team layout, normalised; the default when none is saved (or it cannot be read). */
export async function loadTeamLayout(db: SupabaseClient, lenderId: string): Promise<{ layout: Layout; custom: boolean }> {
  const { data } = await db.from("dashboard_layouts").select("layout").eq("lender_id", lenderId).eq("scope", "team").maybeSingle();
  return data ? { layout: normalizeLayout(data.layout), custom: true } : { layout: DEFAULT_LAYOUT, custom: false };
}
