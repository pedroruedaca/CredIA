/** Policy parameters and per-case values (0031), read through the lender's RLS client. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toParameter, type PolicyParameter } from "./parameters.ts";

const COLUMNS = "id, name, description, unit, scope, value";

/** The lender's parameters by name (none before migration 0031). */
export async function listParameters(db: SupabaseClient): Promise<PolicyParameter[]> {
  const { data, error } = await db.from("policy_parameters").select(COLUMNS).order("name");
  if (error) return [];
  return ((data ?? []) as Parameters<typeof toParameter>[0][]).flatMap((r) => toParameter(r) ?? []);
}

export async function getParameter(db: SupabaseClient, id: string): Promise<PolicyParameter | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("policy_parameters").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toParameter(data as Parameters<typeof toParameter>[0]) : null;
}

/** One case's per-case values (none before migration 0031). */
export async function caseParameterValues(db: SupabaseClient, caseId: string): Promise<{ parameterId: string; value: number }[]> {
  const { data, error } = await db.from("case_parameter_values").select("parameter_id, value").eq("case_id", caseId);
  if (error) return [];
  return ((data ?? []) as { parameter_id: string; value: unknown }[]).map((r) => ({ parameterId: r.parameter_id, value: Number(r.value) })).filter((r) => Number.isFinite(r.value));
}
