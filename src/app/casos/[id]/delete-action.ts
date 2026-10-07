"use server";

/**
 * «Eliminar caso»: removes a case and all of its data for good (src/lib/cases/deletion.ts says what goes). Owners only,
 * confirmed by typing the company's CIF. Files first (service role: clients have no storage access), then the case
 * row through the owner's own session (RLS `cases_delete`, 0023), so the database itself refuses anyone else. If the
 * files cannot all be removed, nothing else is deleted and the owner can try again.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { casePrefixes, confirmsDeletion, filesToRemove } from "@/lib/cases/deletion";
import { caseRef } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteCaseResult = { ok: false; message: string };

const BUCKET = "case-files";

/** Every object under a prefix (folders walked, a few levels deep: `cases/<id>/<kind>/<file>`). */
async function listAll(admin: SupabaseClient, prefix: string, depth = 3): Promise<string[] | null> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
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

export async function deleteCase(caseId: string, typedCif: string): Promise<DeleteCaseResult> {
  const lender = await requireLender();
  if (lender.role !== "owner") return { ok: false, message: "Solo un propietario del equipo puede eliminar casos." };
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || typeof typedCif !== "string") return { ok: false, message: "Caso no encontrado." };

  const supabase = await createClient();
  const { data: kase } = await supabase.from("cases").select("id, lender_id, borrower_cif").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };
  if (!confirmsDeletion(typedCif, kase.borrower_cif)) return { ok: false, message: "El CIF no coincide con el del caso." };

  // Paths the rows name (read through the owner's session: only this lender's case).
  // (Holded raw ledgers live under raw/holded/<case>/, which the listing below covers.)
  const [docs, memos] = await Promise.all([
    supabase.from("documents").select("storage_path").eq("case_id", caseId),
    supabase.from("memos").select("storage_path").eq("case_id", caseId),
  ]);
  if (docs.error || memos.error) return { ok: false, message: "No hemos podido preparar el borrado. Inténtalo de nuevo." };

  const admin = createAdminClient();
  const listed: string[] = [];
  for (const prefix of casePrefixes(caseId)) {
    const found = await listAll(admin, prefix);
    if (found === null) return { ok: false, message: "No hemos podido leer los archivos del caso. No se ha borrado nada." };
    listed.push(...found);
  }
  const files = filesToRemove(caseId, listed, [
    ...(docs.data ?? []).map((d) => d.storage_path as string),
    ...(memos.data ?? []).map((m) => m.storage_path as string),
  ]);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + 100));
    if (error) return { ok: false, message: "No hemos podido borrar todos los archivos del caso. Vuelve a intentarlo; los datos siguen intactos." };
  }

  // The rows, through the owner's session: the database checks the owner role (0023). Everything else cascades.
  const { data: deleted, error } = await supabase.from("cases").delete().eq("id", caseId).select("id");
  if (error || !deleted?.length) return { ok: false, message: "Se han borrado los archivos, pero no los datos del caso. Vuelve a intentarlo." };

  // The case's own audit rows went with it; this one stays (case_id null), with the case id in detail.
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: null,
    actor: lender.userId,
    action: "case.deleted",
    detail: { case_id: caseId, case_ref: caseRef(caseId), files_removed: files.length },
  });
  revalidatePath("/casos");
  redirect("/casos?eliminado=1");
}
