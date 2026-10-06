/** Process templates (case_templates, migration 0019), read through the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCostDefinition } from "../kpis/cost-of-sales.ts";
import { normalizeTemplateRequirements, type CaseTemplate } from "./templates.ts";

const COLUMNS = "id, name, description, product, requirements, layout, updated_at";

type Row = { id: string; name: string; description: string | null; product: string | null; requirements: unknown; layout: unknown; updated_at: string };
const toTemplate = (r: Row): CaseTemplate & { updatedAt: string } => ({
  id: r.id,
  name: r.name,
  description: r.description,
  product: r.product,
  requirements: normalizeTemplateRequirements(r.requirements),
  layout: r.layout ?? null,
  costOfSales: null,
  updatedAt: r.updated_at,
});

export async function listTemplates(db: SupabaseClient) {
  const { data } = await db.from("case_templates").select(COLUMNS).order("name");
  return ((data ?? []) as Row[]).map(toTemplate);
}

export async function getTemplate(db: SupabaseClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("case_templates").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  return { ...toTemplate(data as Row), costOfSales: await templateCostOfSales(db, id) };
}

/** A template's default cost of sales (read on its own: before migration 0021 the column does not exist). */
export async function templateCostOfSales(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("case_templates").select("cost_of_sales").eq("id", id).maybeSingle();
  return error ? null : normalizeCostDefinition((data as { cost_of_sales: unknown } | null)?.cost_of_sales);
}
