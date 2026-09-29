/**
 * POST /api/borrower/:token/documents — step 2 of an upload.
 * Reads the object the browser just uploaded, checks size and content against the extension, hashes it
 * (SHA-256) and records the `documents` row. Rejected files are deleted from Storage.
 */
import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";
import { processCase } from "@/lib/pipeline/process-case";
import { daysBetween } from "@/lib/borrower/checklist";
import { cleanFilename, CONTENT_TYPES, contentMatchesExtension, MAX_UPLOAD_BYTES, parseUploadPath } from "@/lib/borrower/upload-rules";
import { todayMadrid } from "@/lib/format";
import { BANKS } from "@/content/banks.es";

export const runtime = "nodejs";
// Processing (parsing, Claude extraction) runs after the response via after(), within this budget.
export const maxDuration = 300;

const body = z.object({
  path: z.string().min(1).max(300),
  filename: z.string().min(1).max(255),
  bank: z.string().max(40).optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Solicitud no válida.", 400);
  const { path, bank, issuedOn } = parsed.data;
  const filename = cleanFilename(parsed.data.filename);

  const target = parseUploadPath(access.caseId, path);
  if (!target) return jsonError("Solicitud no válida.", 400);
  // A replayed request must not reach the clean-up below, which would delete a recorded file.
  const { data: existing } = await db.from("documents").select("id").eq("storage_path", path).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });
  const bucket = db.storage.from("case-files");
  const reject = async (message: string) => {
    await bucket.remove([path]);
    return jsonError(message, 400);
  };

  const { data: requirement } = await db
    .from("case_requirements")
    .select("max_age_days")
    .eq("case_id", access.caseId)
    .eq("doc_kind", target.kind)
    .maybeSingle();
  if (!requirement) return reject("Este documento no forma parte de tu solicitud.");

  // Certificates with a freshness rule need their issue date (extraction will confirm it later).
  const today = todayMadrid();
  if (requirement.max_age_days) {
    if (!issuedOn || Number.isNaN(Date.parse(issuedOn))) return reject("Indica la fecha de emisión del documento.");
    if (issuedOn > today) return reject("La fecha de emisión no puede ser posterior a hoy.");
    if (daysBetween(issuedOn, today) > 3650) return reject("Revisa la fecha de emisión.");
  }

  const { data: blob, error: dlErr } = await bucket.download(path);
  if (dlErr || !blob) return jsonError("No hemos recibido el fichero. Vuelve a intentarlo.", 400);
  if (blob.size > MAX_UPLOAD_BYTES) return reject(`«${filename}» ocupa más de 20 MB.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!contentMatchesExtension(bytes, target.ext)) {
    return reject(`«${filename}» no parece un fichero .${target.ext} válido. Comprueba que lo has exportado en el formato indicado.`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const bankName = target.kind === "norma43" && bank && BANKS.some((b) => b.id === bank) ? bank : null;
  const { data: doc, error } = await db
    .from("documents")
    .insert({
      case_id: access.caseId,
      lender_id: access.lenderId,
      kind: target.kind,
      storage_path: path,
      sha256,
      original_filename: filename,
      size_bytes: bytes.length,
      content_type: CONTENT_TYPES[target.ext],
      bank: bankName,
      issued_on: requirement.max_age_days ? issuedOn : null,
      uploaded_by: access.actor,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // Same bytes already uploaded for this document: keep the first copy, refresh the typed issue date.
    // (A concurrent replay of this same path also lands here; then the object is the recorded one — keep it.)
    const { data: owner } = await db.from("documents").select("id").eq("storage_path", path).maybeSingle();
    if (!owner) await bucket.remove([path]);
    if (requirement.max_age_days && issuedOn) {
      await db.from("documents").update({ issued_on: issuedOn }).eq("case_id", access.caseId).eq("kind", target.kind).eq("sha256", sha256);
    }
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (error || !doc) {
    await bucket.remove([path]);
    return jsonError("No hemos podido guardar el documento. Inténtalo de nuevo.", 500);
  }

  await audit(db, access, "document.uploaded", { document_id: doc.id, kind: target.kind, sha256, size: bytes.length });
  after(() => processCase(db, access.caseId));
  return NextResponse.json({ ok: true, documentId: doc.id });
}
