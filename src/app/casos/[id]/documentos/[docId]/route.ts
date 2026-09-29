/**
 * Opens a case document for the lender: membership is checked through the RLS client (the row is only visible
 * to members of the case's lender), then the service-role client signs a 60-second URL. PDFs jump to ?pagina=n.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getLenderContext } from "@/lib/lender";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (!UUID.test(id) || !UUID.test(docId)) return new NextResponse("No encontrado", { status: 404 });
  const lender = await getLenderContext();
  if (!lender) return NextResponse.redirect(new URL("/login", req.url));

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, case_id, storage_path, original_filename, content_type")
    .eq("id", docId)
    .eq("case_id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("No encontrado", { status: 404 });

  const { data: signed, error } = await createAdminClient()
    .storage.from("case-files")
    .createSignedUrl(doc.storage_path, 60, { download: doc.content_type === "application/pdf" ? false : (doc.original_filename ?? true) });
  if (error || !signed) return new NextResponse("No hemos podido abrir el documento.", { status: 502 });

  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, case_id: id, actor: lender.userId, action: "document.downloaded", detail: { document_id: doc.id } });

  const page = Number(req.nextUrl.searchParams.get("pagina"));
  const url = Number.isInteger(page) && page > 0 && page < 10_000 ? `${signed.signedUrl}#page=${page}` : signed.signedUrl;
  return NextResponse.redirect(url, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
