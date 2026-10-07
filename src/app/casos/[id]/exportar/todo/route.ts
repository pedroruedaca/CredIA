/**
 * GET /casos/:id/exportar/todo — «Descargar todo»: one zip with every file and every piece of data credIA holds for
 * the case (layout and exclusions in src/lib/cases/full-export.ts). For access and portability requests and to hand a
 * case back at the end of a pilot. Owners only.
 *
 * The case and its rows are read through the owner's session (RLS); the files with the service role once the case is
 * known to be visible. Responses from a function are capped far below a case's size, so the zip is written to the
 * case's private `exports/` folder and the browser is sent to a 60-second signed link. Older zips of the case are
 * removed first; the daily cron removes any left over, and «Eliminar caso» removes the folder.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { loadBankRows } from "@/lib/analyst-chat/server";
import { assembleZip, exportFilename, exportPrefix, MAX_EXPORT_BYTES, staleExports } from "@/lib/cases/full-export";
import { packageJson } from "@/lib/case-view/export";
import { loadCaseView } from "@/lib/case-view/load";
import { buildPackage } from "@/lib/case-view/package";
import { caseRef, todayMadrid } from "@/lib/format";
import { getLenderContext } from "@/lib/lender";
import { CASE_BUCKET, listAll } from "@/lib/storage/list";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const text = (status: number, body: string) => new NextResponse(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const TOO_BIG = "El caso es demasiado grande para descargarlo en un solo archivo. Escríbenos y te lo preparamos.";

/** All rows of a case-scoped table, paged (PostgREST caps a response at 1.000 rows). */
async function allRows(db: Awaited<ReturnType<typeof createClient>>, table: string, columns: string, caseId: string, order: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).eq("case_id", caseId).order(order).range(from, from + 999);
    if (error) return null;
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return text(404, "No encontrado");
  const lender = await getLenderContext();
  if (!lender) return NextResponse.redirect(new URL("/login", req.url));
  if (lender.role !== "owner") return text(403, "Solo un propietario del equipo puede descargar el caso completo.");

  const db = await createClient();
  const data = await loadCaseView(db, id);
  if (!data) return text(404, "No encontrado");

  const [kase, docs, audit, links, assistant, support, bank] = await Promise.all([
    db.from("cases").select("borrower_email, status, requested_product, requested_amount, requested_term_months, fiscal_year_end, created_at, submitted_at, consent_withdrawn_at, borrower_token_expires_at").eq("id", id).maybeSingle(),
    allRows(db, "documents", "id, kind, original_filename, storage_path, sha256, size_bytes, content_type, status, uploaded_by, uploaded_at, issued_on", id, "uploaded_at"),
    allRows(db, "audit_log", "action, actor, at, detail", id, "at"),
    allRows(db, "delegate_links", "email, created_at, expires_at, revoked_at", id, "created_at"),
    allRows(db, "assistant_messages", "role, content, delegate_link_id, created_at", id, "created_at"),
    allRows(db, "support_requests", "actor, message, status, created_at", id, "created_at"),
    loadBankRows(db, id),
  ]);
  if (!kase.data || !docs || !audit || !links || !assistant || !support) return text(500, "No hemos podido leer el caso. Inténtalo de nuevo.");

  // Files, with the service role now that the owner's session has shown the case is theirs.
  const admin = createAdminClient();
  const bucket = admin.storage.from(CASE_BUCKET);
  let total = 0;
  const read = async (path: string): Promise<Uint8Array | null | "too_big"> => {
    const { data: blob, error } = await bucket.download(path);
    if (error || !blob) return null;
    total += blob.size;
    return total > MAX_EXPORT_BYTES ? "too_big" : new Uint8Array(await blob.arrayBuffer());
  };
  type Doc = { id: string; kind: string; original_filename: string | null; storage_path: string };
  const documents: (Doc & { bytes: Uint8Array | null })[] = [];
  for (const d of docs as unknown as Doc[]) {
    // Rows are written by the service role only (0023), but a path outside this case's folder is never read anyway.
    const bytes = d.storage_path.startsWith(`cases/${id}/`) ? await read(d.storage_path) : null;
    if (bytes === "too_big") return text(413, TOO_BIG);
    documents.push({ ...d, bytes });
  }
  const holded: { name: string; bytes: Uint8Array | null }[] = [];
  for (const p of (await listAll(admin, `raw/holded/${id}`)) ?? []) {
    const bytes = await read(p);
    if (bytes === "too_big") return text(413, TOO_BIG);
    holded.push({ name: p.split("/").pop() ?? "holded.json", bytes });
  }

  const generatedAt = new Date().toISOString();
  const ref = caseRef(id);
  const { zip, missing } = assembleZip({
    readme: { caseRef: ref, companyName: data.kase.companyName, cif: data.kase.cif, lenderName: data.kase.lenderName, generatedAt, generatedBy: lender.email },
    caso: { id, referencia: ref, empresa: data.kase.companyName, cif: data.kase.cif, prestamista: data.kase.lenderName, ...kase.data },
    paquete: packageJson(data, buildPackage(data), generatedAt),
    documents,
    holded,
    bank,
    communications: { enlaces_gestoria: links, asistente_de_documentacion: assistant, avisos_a_una_persona: support },
    audit,
  });

  // Earlier zips of this case go first (not the last few minutes': a double click must not break the first download);
  // then this one, handed out through a short signed link.
  const prefix = exportPrefix(id);
  const existing = (await bucket.list(prefix, { limit: 100 })).data ?? [];
  const stale = staleExports(existing.map((o) => o.name), Date.now(), 10 * 60 * 1000).map((n) => `${prefix}/${n}`);
  if (stale.length) await bucket.remove(stale);
  const path = `${prefix}/${Date.now()}-${randomUUID()}.zip`;
  const { error: upErr } = await bucket.upload(path, zip, { contentType: "application/zip", upsert: false });
  if (upErr) return text(502, "No hemos podido preparar la descarga. Inténtalo de nuevo.");
  const filename = exportFilename(ref, todayMadrid());
  const { data: signed, error: signErr } = await bucket.createSignedUrl(path, 60, { download: filename });
  if (signErr || !signed) return text(502, "No hemos podido preparar la descarga. Inténtalo de nuevo.");

  await db.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: id,
    actor: lender.userId,
    action: "package.exported",
    detail: { format: "zip_complete", documents: documents.length, missing: missing.length, bytes: zip.length },
  });
  return NextResponse.redirect(signed.signedUrl, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
