/**
 * POST /api/borrower/:link/uploads — step 1 of an upload.
 * Validates the declared file, checks the case's room and the upload rate limits (src/lib/borrower/limits.ts), and
 * returns a signed upload URL for Supabase Storage, so large files go
 * straight from the browser to Storage (serverless request bodies are capped well below 20 MB).
 * Step 2 is POST /documents, which checks the stored bytes and records the document.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { borrowerRoute, jsonError } from "@/lib/borrower/access";
import { caseHasRoom, RATE_LIMITED_MESSAGE } from "@/lib/borrower/limits";
import { caseUsage, withinRateLimit } from "@/lib/borrower/rate";
import { checkDeclaredFile, uploadPath } from "@/lib/borrower/upload-rules";
import { REQUIREMENT_KINDS } from "@/lib/cases/requirements";

export const runtime = "nodejs";

const body = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  filename: z.string().min(1).max(255),
  size: z.number().int(),
});

export async function POST(req: Request, ctx: { params: Promise<{ link: string }> }) {
  const r = await borrowerRoute((await ctx.params).link);
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

  // Room in the case (documents and bytes), then the link holder's and the case's upload rates.
  const room = caseHasRoom(await caseUsage(db, access.caseId), size);
  if (!room.ok) return jsonError(room.message, 409);
  for (const route of ["upload", "uploadCase"] as const) {
    if (!(await withinRateLimit(db, route, access))) return jsonError(RATE_LIMITED_MESSAGE[route], 429);
  }

  const path = uploadPath(access.caseId, kind, randomUUID(), check.ext);
  const { data, error } = await db.storage.from("case-files").createSignedUploadUrl(path);
  if (error || !data) return jsonError("No hemos podido preparar la subida. Inténtalo de nuevo.", 500);

  return NextResponse.json({ path: data.path, uploadToken: data.token });
}
