/** Exports the credit data package (PDF, Excel or JSON). Lender session + RLS; every export is audit-logged. */
import { NextResponse, type NextRequest } from "next/server";
import { exportFilename, packageJson, packageXlsx } from "@/lib/case-view/export";
import { loadCaseView } from "@/lib/case-view/load";
import { loadCaseLayout } from "@/lib/case-view/layout-store";
import { buildPackage } from "@/lib/case-view/package";
import { packagePdf } from "@/lib/case-view/pdf";
import { todayMadrid } from "@/lib/format";
import { getLenderContext } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(format in TYPES)) return new NextResponse("No encontrado", { status: 404 });
  const lender = await getLenderContext();
  if (!lender) return NextResponse.redirect(new URL("/login", req.url));

  const supabase = await createClient();
  const data = await loadCaseView(supabase, id);
  if (!data) return new NextResponse("No encontrado", { status: 404 });

  const pkg = buildPackage(data);
  const generatedAt = new Date().toISOString();
  const fmt = format as keyof typeof TYPES;
  let body: Buffer | string;
  try {
    body =
      fmt === "json" ? JSON.stringify(packageJson(data, pkg, generatedAt), null, 2)
      : fmt === "xlsx" ? await packageXlsx(data, pkg, generatedAt)
      : await packagePdf(data, pkg, generatedAt, (await loadCaseLayout(supabase, id, lender.lenderId)).layout);
  } catch (err) {
    console.error("[export] failed", { caseId: id, format: fmt, error: err instanceof Error ? err.message : "unknown" });
    return new NextResponse("No hemos podido generar la exportación. Inténtalo de nuevo.", { status: 500 });
  }

  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, case_id: id, actor: lender.userId, action: "package.exported", detail: { format: fmt } });

  const filename = exportFilename(data, fmt, todayMadrid());
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": TYPES[fmt],
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
