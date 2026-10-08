/**
 * Removes every stored file of a case: what the listing finds under its prefixes plus any path its rows name (pure
 * rules in ./deletion.ts). Used by «Eliminar caso» and by the retention purge. Server-only (service role).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_BUCKET, listAll } from "../storage/list.ts";
import { casePrefixes, filesToRemove } from "./deletion.ts";

export type RemoveFilesResult = { ok: true; removed: number } | { ok: false; reason: "list_failed" | "remove_failed" };

export async function removeCaseFiles(admin: SupabaseClient, caseId: string, named: readonly (string | null | undefined)[]): Promise<RemoveFilesResult> {
  const listed: string[] = [];
  for (const prefix of casePrefixes(caseId)) {
    const found = await listAll(admin, prefix);
    if (found === null) return { ok: false, reason: "list_failed" };
    listed.push(...found);
  }
  const files = filesToRemove(caseId, listed, named);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from(CASE_BUCKET).remove(files.slice(i, i + 100));
    if (error) return { ok: false, reason: "remove_failed" };
  }
  return { ok: true, removed: files.length };
}
