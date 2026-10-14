/** Process templates ("Plantillas"): the team's saved document sets and dashboards, to start cases from. */
import { LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { ListRowLink } from "@/components/ui/ListRow";
import { Pill } from "@/components/ui/Pill";
import { productLabel } from "@/content/products.es";
import { listTemplates } from "@/lib/cases/template-store";
import { templateSummary } from "@/lib/cases/templates";
import { loadTeamLayout } from "@/lib/case-view/layout-store";
import { moduleTitle } from "@/lib/case-view/modules";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plantillas · credIA" };
export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const db = await createClient();
  const [templates, team] = await Promise.all([listTemplates(db), loadTeamLayout(db, lender.lenderId)]);
  const ownPanels = templates.filter((t) => t.layout);
  const usingTeam = templates.length - ownPanels.length;
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
      {/* The team's standard panel: what cases see when neither they nor their template have a panel of their own. */}
      <section aria-labelledby="panel-equipo" className="mb-12 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h2 id="panel-equipo" className="heading-section">Panel estándar del equipo</h2>
          <Pill tone={team.custom ? "accent" : "neutral"}>{team.custom ? "Diseño del equipo" : "Diseño original"}</Pill>
          <div className="grow" />
          {canEdit && (
            <Link href="/plantillas/panel" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium">
              <LayoutDashboard size={15} strokeWidth={1.8} aria-hidden /> Diseñar
            </Link>
          )}
        </div>
        <p className="text-[15px] text-ink-2">{team.layout.modules.map((m) => moduleTitle(m) + (m.width === "half" ? " (½)" : "")).join(" · ")}</p>
        <p className="text-[13px] text-muted">
          Lo usan los casos sin plantilla{templates.length > 0 && `, ${usingTeam === templates.length ? "todas las plantillas" : `${usingTeam} de ${templates.length} plantillas`}`}
          {ownPanels.length > 0 && ` · Con panel propio: ${ownPanels.map((t) => t.name).join(", ")}`}. Un caso concreto puede tener además su propio diseño.
        </p>
      </section>

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
