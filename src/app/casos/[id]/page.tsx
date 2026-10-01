/** Lender case view. Loaded through the lender's RLS client; the body lives in CaseView. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CaseView } from "@/components/case/CaseView";
import { loadCaseView } from "@/lib/case-view/load";
import { loadCaseLayout } from "@/lib/case-view/layout-store";
import { requireLender } from "@/lib/lender";
import { logCaseRead } from "@/lib/lender-audit";
import { stuckCases } from "@/lib/pipeline/kick";
import { processCase } from "@/lib/pipeline/process-case";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Work started from this page runs after the response: lender uploads, BORME reads on demand, and re-running a case
// found stuck in processing.
export const maxDuration = 300;
export const metadata: Metadata = { title: "Caso · credIA", robots: { index: false, follow: false } };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ check?: string; personalizar?: string }> }) {
  const { id } = await params;
  const { check, personalizar } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lender = await requireLender();
  const db = await createClient();
  const data = await loadCaseView(db, id);
  if (!data) notFound();
  await logCaseRead(db, lender, id, "case.viewed");
  const caseLayout = await loadCaseLayout(db, id, lender.lenderId);
  const canEdit = lender.role !== "viewer";
  const editing = canEdit && personalizar === "1";
  // A run that died (time limit, deploy, database read-only) leaves the case in "Procesando": run it again.
  const admin = createAdminClient();
  const stuck = (await stuckCases(admin, [id])).length > 0;
  if (stuck) after(() => processCase(admin, id));
  const busy = stuck || data.kase.status === "processing" || data.documents.some((d) => d.status === "parsing" || (d.status === "uploaded" && !d.summary));
  return (
    <>
      <AutoRefresh active={busy && !editing} />
      <CaseView data={data} check={check ?? null} canEdit={canEdit} userId={lender.userId} layout={caseLayout.layout} layoutInfo={caseLayout} editing={editing} />
    </>
  );
}
