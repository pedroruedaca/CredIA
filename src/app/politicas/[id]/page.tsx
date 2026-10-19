/** One credit policy: its criteria (form) and how to delete it. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { POLICY_NOTE } from "@/content/policies.es";
import { requireLender } from "@/lib/lender";
import { criteriaToStored, thresholdText } from "@/lib/policies/policy";
import { listParameters } from "@/lib/policies/parameter-store";
import { getPolicy } from "@/lib/policies/store";
import { createClient } from "@/lib/supabase/server";
import { PolicyForm } from "../PolicyForm";
import { DeletePolicy } from "./DeletePolicy";

export const metadata = { title: "Política · credIA" };
export const dynamic = "force-dynamic";

export default async function PoliticaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardada?: string }> }) {
  const { id } = await params;
  const { guardada } = await searchParams;
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const db = await createClient();
  const [p, parameters] = await Promise.all([getPolicy(db, id), listParameters(db)]);
  if (!p) notFound();
  const criteria = JSON.stringify(
    criteriaToStored(p.criteria).map((c) => ("factor" in c ? { ...c, factor: thresholdText(c.factor) } : { ...c, threshold: thresholdText(c.threshold) })),
  );
  return (
    <main className="w-full max-w-3xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
          <Link href="/politicas">Políticas</Link> / {p.name}
          {guardada && <Pill tone="ok">Guardada</Pill>}
        </div>
        <h1 className="heading-page">{p.name}</h1>
        <p className="text-[15px] text-ink-2">Los casos a los que se aplica la verán con estos criterios al momento. {POLICY_NOTE}</p>
      </div>
      <PolicyForm key={p.id} id={p.id} canEdit={canEdit} parameters={parameters} initial={{ name: p.name, description: p.description ?? "", criteria }} />
      {canEdit && (
        <div className="mt-12">
          <DeletePolicy id={p.id} />
        </div>
      )}
    </main>
  );
}
