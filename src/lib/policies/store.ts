/** Credit policies (credit_policies, migration 0029), read through the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCriteria, type CreditPolicy } from "./policy.ts";

const COLUMNS = "id, name, description, criteria, updated_at";

type Row = { id: string; name: string; description: string | null; criteria: unknown; updated_at: string };
const toPolicy = (r: Row): CreditPolicy & { updatedAt: string } => ({
  id: r.id,
  name: r.name,
  description: r.description,
  criteria: normalizeCriteria(r.criteria),
  updatedAt: r.updated_at,
});

/** The lender's policies by name (none before migration 0029). */
export async function listPolicies(db: SupabaseClient) {
  const { data, error } = await db.from("credit_policies").select(COLUMNS).order("name");
  return error ? [] : ((data ?? []) as Row[]).map(toPolicy);
}

export async function getPolicy(db: SupabaseClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("credit_policies").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toPolicy(data as Row) : null;
}
