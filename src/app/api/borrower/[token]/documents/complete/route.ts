/**
 * POST /api/borrower/:token/documents/complete
 * Step 2 of an upload: the file is already in Storage (signed URL from `../upload-url`). Re-validate it from its
 * bytes (size, extension ↔ magic bytes), hash it, apply the lender's freshness rule and record the document.
 * Invalid objects are deleted so nothing unchecked stays in the bucket.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { BANK_IDS } from "@/content/banks.es";
import { REQUIREMENT_KINDS } from "@/lib/cases/requirements";
import { borrowerAudit } from "@/lib/borrower/access";
import { freshnessProblem } from "@/lib/borrower/checklist";
import { borrowerAccess, fail } from "@/lib/borrower/http";
import { checkUpload } from "@/lib/borrower/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  path: z.string().min(1).max(400),
  name: z.string().min(1).max(255),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bank: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const access = await borrowerAccess(token);
  if (access instanceof NextResponse) return access;
  const { db, kase } = access;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Petición no válida.");
  const { kind, path, name, issuedOn } = parsed.data;
  const bank = kind === "norma43" && parsed.data.bank && BANK_IDS.includes(parsed.data.bank) ? parsed.data.bank : null;

  // The path must be one we issued for this case and kind.
  const prefix = `cases/${kase.id}/${kind}/`;
  if (!path.startsWith(prefix) || !/^[A-Za-z0-9._-]+$/.test(path.slice(prefix.length))) return fail(400, "Petición no válida.");

  const { data: requirement } = await db
    .from("case_requirements")
    .select("max_age_days")
    .eq("case_id", kase.id)
    .eq("doc_kind", kind)
    .maybeSingle();
  if (!requirement) return fail(400, "Este documento no forma parte de la solicitud.");
  if (requirement.max_age_days && !issuedOn) return fail(400, "Indica la fecha de emisión del documento.");

  const bucket = db.storage.from("case-files");
  const { data: blob, error: dlErr } = await bucket.download(path);
  if (dlErr || !blob) return fail(400, "No hemos recibido el fichero. Vuelve a intentarlo.");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const check = checkUpload(kind, name, bytes.byteLength, bytes.subarray(0, 512));
  if (!check.ok) {
    await bucket.remove([path]);
    return fail(400, check.message);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const stale = requirement.max_age_days && issuedOn ? freshnessProblem(issuedOn, requirement.max_age_days, kase.lender_name, new Date()) : null;
  const status = stale ? "rejected" : "uploaded";

  const { data: existing } = await db
    .from("documents")
    .select("id, status")
    .eq("case_id", kase.id)
    .eq("kind", kind)
    .eq("sha256", sha256)
    .maybeSingle();

  let documentId: string;
  if (existing) {
    // Same file again: keep the stored copy. A previously rejected one is re-evaluated (e.g. a corrected date).
    await bucket.remove([path]);
    documentId = existing.id;
    if (existing.status === "rejected") {
      await db.from("documents").update({ issued_on: issuedOn ?? null, status, status_message: stale }).eq("id", existing.id);
    }
  } else {
    const { data: doc, error } = await db
      .from("documents")
      .insert({
        case_id: kase.id,
        lender_id: kase.lender_id,
        kind,
        storage_path: path,
        sha256,
        status,
        status_message: stale,
        original_name: name.slice(0, 255),
        size_bytes: bytes.byteLength,
        mime_type: check.mimeType,
        bank,
        issued_on: issuedOn ?? null,
        uploaded_by: access.actor,
      })
      .select("id")
      .single();
    if (error || !doc) {
      await bucket.remove([path]);
      return fail(500, "No hemos podido guardar el documento. Inténtalo de nuevo.");
    }
    documentId = doc.id;
  }

  await borrowerAudit(access, "document.uploaded", {
    document_id: documentId,
    kind,
    sha256,
    size_bytes: bytes.byteLength,
    status,
    duplicate: !!existing,
  });

  return NextResponse.json({ ok: true, documentId, status, message: stale, duplicate: !!existing });
}
