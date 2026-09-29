/**
 * POST /api/borrower/:token/documents/upload-url
 * Step 1 of an upload: validate kind, name and size, then hand out a one-off signed URL so the browser uploads
 * straight to Storage (serverless request bodies are capped well below 20 MB). Step 2 is `../complete`,
 * which sniffs the content, hashes it and records the document.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { REQUIREMENT_KINDS } from "@/lib/cases/requirements";
import { borrowerAccess, fail } from "@/lib/borrower/http";
import { checkUploadMeta } from "@/lib/borrower/upload";

export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const access = await borrowerAccess(token);
  if (access instanceof NextResponse) return access;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Petición no válida.");
  const { kind, name, size } = parsed.data;

  const { data: requirement } = await access.db
    .from("case_requirements")
    .select("id")
    .eq("case_id", access.kase.id)
    .eq("doc_kind", kind)
    .maybeSingle();
  if (!requirement) return fail(400, "Este documento no forma parte de la solicitud.");

  const check = checkUploadMeta(kind, name, size);
  if (!check.ok) return fail(400, check.message);

  const path = `cases/${access.kase.id}/${kind}/${randomUUID()}-${check.safeName}`;
  const { data, error } = await access.db.storage.from("case-files").createSignedUploadUrl(path);
  if (error || !data) return fail(500, "No hemos podido preparar la subida. Inténtalo de nuevo.");

  return NextResponse.json({ path: data.path, token: data.token });
}
