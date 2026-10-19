/** Credit policies («Políticas»): the lender's thresholds on the KPIs, applied from a case's «Indicadores». */
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { ListRowLink } from "@/components/ui/ListRow";
import { KPI_LABEL } from "@/content/case-view.es";
import { POLICIES_INTRO, POLICY_NOTE } from "@/content/policies.es";
import { requireLender } from "@/lib/lender";
import { listPolicies } from "@/lib/policies/store";
import { createClient } from "@/lib/supabase/server";
import { PolicyTabs } from "./PolicyTabs";

export const metadata = { title: "Políticas · credIA" };
export const dynamic = "force-dynamic";

export default async function PoliticasPage() {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const policies = await listPolicies(await createClient());
  return (
    <main className="w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        {/* Title and the create button on one line; the intro below them. */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="heading-page grow">Políticas</h1>
          {canEdit && (
            <ButtonLink href="/politicas/nueva">
              <Plus size={18} strokeWidth={2} aria-hidden /> Nueva política
            </ButtonLink>
          )}
        </div>
        <PolicyTabs current="policies" />
        <p className="max-w-[640px] text-[17px] text-ink-2">{POLICIES_INTRO}</p>
      </div>
      {policies.length === 0 ? (
        <div className="rounded-panel bg-soft px-8 py-14 text-center">
          <h2 className="heading-section">Aún no hay políticas</h2>
          <p className="mt-1 text-[15px] text-ink-2">Fija los umbrales de vuestra entidad una vez y compáralos con cada caso.</p>
          {canEdit && <ButtonLink href="/politicas/nueva" variant="link">Crear la primera política</ButtonLink>}
        </div>
      ) : (
        <ul aria-label="Políticas" className="flex flex-col gap-1">
          {policies.map((p) => (
            <li key={p.id}>
              <ListRowLink href={`/politicas/${p.id}`}>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[17px] font-medium">{p.name}</span>
                  <span className="truncate text-sm text-muted">
                    {[`${p.criteria.length} ${p.criteria.length === 1 ? "criterio" : "criterios"}`, p.criteria.slice(0, 4).map((c) => KPI_LABEL[c.metric] ?? c.metric).join(", "), p.description].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </ListRowLink>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-10 max-w-[640px] text-[13px] text-muted">{POLICY_NOTE}</p>
    </main>
  );
}
