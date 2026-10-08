/**
 * Limits for the company's links, in the database (rules in ./limits.ts). Server-only (service role).
 * The rate limit fails open: if the counter cannot be read, the request goes ahead (logged), so a database hiccup
 * never blocks a company from uploading its documents.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BorrowerAccess } from "./access.ts";
import { RATE_LIMITS, rateKey, type RateLimitedRoute } from "./limits.ts";

export async function withinRateLimit(db: SupabaseClient, route: RateLimitedRoute, access: Pick<BorrowerAccess, "caseId" | "delegateId">): Promise<boolean> {
  const { max, windowSeconds } = RATE_LIMITS[route];
  const { data, error } = await db.rpc("hit_rate_limit", { p_key: rateKey(route, access), p_window_seconds: windowSeconds, p_max: max });
  if (error) {
    console.error(`[rate-limit] ${route} not counted: ${error.code ?? "unknown"}`);
    return true;
  }
  return data === true;
}

/** Documents a case already holds, and their total size. */
export async function caseUsage(db: SupabaseClient, caseId: string): Promise<{ count: number; bytes: number }> {
  const { data } = await db.from("documents").select("size_bytes").eq("case_id", caseId);
  const rows = (data ?? []) as { size_bytes: number | null }[];
  return { count: rows.length, bytes: rows.reduce((s, r) => s + Number(r.size_bytes ?? 0), 0) };
}
