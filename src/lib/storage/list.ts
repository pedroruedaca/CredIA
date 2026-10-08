/** Storage listing for the case-files bucket. Server-only (service role: clients have no Storage access). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CASE_BUCKET = "case-files";

/** Every object under a prefix, folders walked a few levels deep (`cases/<id>/<kind>/<file>`); null if a listing fails. */
export async function listAll(admin: SupabaseClient, prefix: string, depth = 3): Promise<string[] | null> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(CASE_BUCKET).list(prefix, { limit: 1000, offset });
    if (error) return null;
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) out.push(path);
      else if (depth > 0) {
        const nested = await listAll(admin, path, depth - 1);
        if (nested === null) return null;
        out.push(...nested);
      }
    }
    if ((data ?? []).length < 1000) return out;
  }
}
