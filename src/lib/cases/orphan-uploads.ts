/**
 * Files uploaded with a signed URL but never registered as a document (the browser uploads straight to Storage, then
 * asks the server to record the file; a closed tab or a misuse of the link leaves the file behind). The daily cron
 * removes those older than ORPHAN_MIN_AGE_MS from open cases' folders. Closed cases' files go with the purge.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_BUCKET } from "../storage/list.ts";

/** Long enough for any upload in progress to have been registered. */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** Pure: stored files under a case that no row names and that are old enough to be abandoned. */
export function orphanPaths(stored: { path: string; createdAt: string | null }[], registered: ReadonlySet<string>, now: number, minAgeMs = ORPHAN_MIN_AGE_MS): string[] {
  return stored
    .filter((f) => !registered.has(f.path) && f.createdAt !== null && now - new Date(f.createdAt).getTime() > minAgeMs)
    .map((f) => f.path);
}

/** `cases/<id>/<kind>/<file>` objects with their creation time; null if a listing fails. */
async function listCaseFiles(admin: SupabaseClient, caseId: string): Promise<{ path: string; createdAt: string | null }[] | null> {
  const bucket = admin.storage.from(CASE_BUCKET);
  const { data: kinds, error } = await bucket.list(`cases/${caseId}`, { limit: 100 });
  if (error) return null;
  const out: { path: string; createdAt: string | null }[] = [];
  for (const k of kinds ?? []) {
    if (k.id) continue; // a file directly under the case folder: not an upload path
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error: e } = await bucket.list(`cases/${caseId}/${k.name}`, { limit: 1000, offset });
      if (e) return null;
      for (const f of files ?? []) if (f.id) out.push({ path: `cases/${caseId}/${k.name}/${f.name}`, createdAt: f.created_at ?? null });
      if ((files ?? []).length < 1000) break;
    }
  }
  return out;
}

/** Daily cron: removes abandoned uploads from open cases. Returns how many files were removed. */
export async function sweepOrphanUploads(admin: SupabaseClient, now = Date.now()): Promise<number> {
  const { data: cases } = await admin.from("cases").select("id").neq("status", "archived").order("updated_at", { ascending: false }).limit(500);
  let removed = 0;
  for (const { id } of (cases ?? []) as { id: string }[]) {
    const stored = await listCaseFiles(admin, id);
    if (!stored?.length) continue;
    const [docs, memos] = await Promise.all([
      admin.from("documents").select("storage_path").eq("case_id", id),
      admin.from("memos").select("storage_path").eq("case_id", id),
    ]);
    if (docs.error || memos.error) continue;
    const registered = new Set([...(docs.data ?? []), ...(memos.data ?? [])].map((r) => r.storage_path as string));
    const orphans = orphanPaths(stored, registered, now);
    if (orphans.length && !(await admin.storage.from(CASE_BUCKET).remove(orphans)).error) removed += orphans.length;
  }
  return removed;
}
