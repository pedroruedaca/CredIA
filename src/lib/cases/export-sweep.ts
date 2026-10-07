/** Removes «Descargar todo» zips older than EXPORT_MAX_AGE_MS from every case (run by the daily cron). Server-only. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_BUCKET } from "../storage/list.ts";
import { EXPORT_MAX_AGE_MS, staleExports } from "./full-export.ts";

export async function sweepExports(admin: SupabaseClient, now = Date.now()): Promise<number> {
  const bucket = admin.storage.from(CASE_BUCKET);
  const { data: cases } = await bucket.list("exports", { limit: 1000 });
  let removed = 0;
  for (const folder of cases ?? []) {
    if (folder.id) continue; // only case folders
    const prefix = `exports/${folder.name}`;
    const { data: zips } = await bucket.list(prefix, { limit: 100 });
    const stale = staleExports((zips ?? []).map((z) => z.name), now, EXPORT_MAX_AGE_MS).map((n) => `${prefix}/${n}`);
    if (stale.length && !(await bucket.remove(stale)).error) removed += stale.length;
  }
  return removed;
}
