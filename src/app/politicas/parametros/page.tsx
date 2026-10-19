/** «Parámetros»: values the lender's policies compare the KPIs with, fixed for every case or entered per case. */
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Figure } from "@/components/ui/Figure";
import { ListRowLink } from "@/components/ui/ListRow";
import { Pill } from "@/components/ui/Pill";
import { PARAMETERS_INTRO, PARAMETER_SCOPE_LABEL } from "@/content/policies.es";
import { requireLender } from "@/lib/lender";
import { listParameters } from "@/lib/policies/parameter-store";
import { listPolicies } from "@/lib/policies/store";
import { createClient } from "@/lib/supabase/server";
import { PolicyTabs } from "../PolicyTabs";

export const metadata = { title: "Parámetros · credIA" };
export const dynamic = "force-dynamic";

export default async function ParametrosPage({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const db = await createClient();
  const [parameters, policies, { guardado }] = await Promise.all([listParameters(db), listPolicies(db), searchParams]);
  const usedBy = (id: string) => policies.filter((p) => p.criteria.some((c) => c.parameter?.id === id)).length;
  return (
    <main className="w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="heading-page grow">Parámetros</h1>
          {canEdit && (
            <ButtonLink href="/politicas/parametros/nuevo">
              <Plus size={18} strokeWidth={2} aria-hidden /> Nuevo parámetro
            </ButtonLink>
          )}
        </div>
        <PolicyTabs current="parameters" />
        <p className="max-w-[640px] text-[17px] text-ink-2">{PARAMETERS_INTRO}</p>
        {guardado && <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="ok">Guardado</Pill>El parámetro se ha guardado.</p>}
      </div>
      {parameters.length === 0 ? (
        <div className="rounded-panel bg-soft px-8 py-14 text-center">
          <h2 className="heading-section">Aún no hay parámetros</h2>
          <p className="mt-1 text-[15px] text-ink-2">Crea uno y úsalo en los criterios de vuestras políticas.</p>
          {canEdit && <ButtonLink href="/politicas/parametros/nuevo" variant="link">Crear el primer parámetro</ButtonLink>}
        </div>
      ) : (
        <ul aria-label="Parámetros" className="flex flex-col gap-1">
          {parameters.map((p) => {
            const n = usedBy(p.id);
            return (
              <li key={p.id}>
                <ListRowLink href={`/politicas/parametros/${p.id}`}>
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-[17px] font-medium">{p.name}</span>
                    <span className="truncate text-sm text-muted">
                      {[PARAMETER_SCOPE_LABEL[p.scope], n ? `en ${n} ${n === 1 ? "política" : "políticas"}` : "sin usar", p.description].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {p.scope === "fixed" && <Figure value={p.value} unit={p.unit} className="text-[17px]" />}
                </ListRowLink>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
