/**
 * POST /api/borrower/:token/uploads — step 1 of an upload.
 * Validates the declared file and returns a signed upload URL for Supabase Storage, so large files go
 * straight from the browser to Storage (serverless request bodies are capped well below 20 MB).
 * Step 2 is POST /documents, which checks the stored bytes and records the document.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { borrowerRoute, jsonError } from "@/lib/borrower/access";
import { checkDeclaredFile, uploadPath } from "@/lib/borrower/upload-rules";
import { REQUIREMENT_KINDS } from "@/lib/cases/requirements";

export const runtime = "nodejs";

const body = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  filename: z.string().min(1).max(255),
  size: z.number().int(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Solicitud no válida.", 400);
  const { kind, filename, size } = parsed.data;

  const { data: requirement } = await db
    .from("case_requirements")
    .select("id")
    .eq("case_id", access.caseId)
    .eq("source", "borrower")
    .eq("doc_kind", kind)
    .maybeSingle();
  if (!requirement) return jsonError("Este documento no forma parte de tu solicitud.", 400);

  const check = checkDeclaredFile(kind, filename, size);
  if (!check.ok) return jsonError(check.message, 400);

  const path = uploadPath(access.caseId, kind, randomUUID(), check.ext);
  const { data, error } = await db.storage.from("case-files").createSignedUploadUrl(path);
  if (error || !data) return jsonError("No hemos podido preparar la subida. Inténtalo de nuevo.", 500);

  return NextResponse.json({ path: data.path, uploadToken: data.token });
}
