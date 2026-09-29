/** Lender case view. Loaded through the lender's RLS client; the body lives in CaseView. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseView } from "@/components/case/CaseView";
import { loadCaseView } from "@/lib/case-view/load";
import { requireLender } from "@/lib/lender";
import { logCaseRead } from "@/lib/lender-audit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caso · credIA", robots: { index: false, follow: false } };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ check?: string }> }) {
  const { id } = await params;
  const { check } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lender = await requireLender();
  const db = await createClient();
  const data = await loadCaseView(db, id);
  if (!data) notFound();
  await logCaseRead(db, lender, id, "case.viewed");
  return <CaseView data={data} check={check ?? null} canEdit={lender.role !== "viewer"} userId={lender.userId} />;
}
