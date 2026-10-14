/** Process templates ("Plantillas"): the team's saved document sets and dashboards, to start cases from. */
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { ListRowLink } from "@/components/ui/ListRow";
import { Pill } from "@/components/ui/Pill";
import { productLabel } from "@/content/products.es";
import { listTemplates } from "@/lib/cases/template-store";
import { templateSummary } from "@/lib/cases/templates";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plantillas · credIA" };
export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const templates = await listTemplates(await createClient());
  return (
    <main className="w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-wrap items-end gap-4">
        <div className="grow">
          <h1 className="heading-page">Plantillas</h1>
          <p className="mt-3 max-w-[640px] text-[17px] text-ink-2">
            Procesos guardados: qué documentos se piden y cómo se ve el panel del caso. Al crear un caso eliges una y puedes ajustarla.
          </p>
        </div>
        {canEdit && (
          <ButtonLink href="/plantillas/nueva">
            <Plus size={18} strokeWidth={2} aria-hidden /> Nueva plantilla
          </ButtonLink>
        )}
      </div>
      {templates.length === 0 ? (
        <div className="rounded-panel bg-soft px-8 py-14 text-center">
          <h2 className="heading-section">Aún no hay plantillas</h2>
          <p className="mt-1 text-[15px] text-ink-2">Guarda los documentos y el panel de un tipo de operación para no repetirlos en cada caso.</p>
          {canEdit && <ButtonLink href="/plantillas/nueva" variant="link">Crear la primera plantilla</ButtonLink>}
        </div>
      ) : (
        <ul aria-label="Plantillas" className="flex flex-col gap-1">
          {templates.map((t) => (
            <li key={t.id}>
              <ListRowLink href={`/plantillas/${t.id}`}>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[17px] font-medium">{t.name}</span>
                  <span className="truncate text-sm text-muted">
                    {[t.product ? productLabel(t.product) : null, templateSummary(t.requirements), t.description].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Pill tone={t.layout ? "accent" : "neutral"} className="hidden sm:inline-flex">{t.layout ? "Panel propio" : "Panel del equipo"}</Pill>
              </ListRowLink>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
