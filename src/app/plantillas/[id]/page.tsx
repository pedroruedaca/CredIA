/** One template: its documents (form) and its case-view dashboard (own layout, or the team's). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { LayoutEditor } from "@/components/case/modules/LayoutEditor";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { loadTeamLayout } from "@/lib/case-view/layout-store";
import { moduleTitle, normalizeLayout } from "@/lib/case-view/modules";
import { getTemplate } from "@/lib/cases/template-store";
import { templateFormValues } from "@/lib/cases/templates";
import { costFormValues } from "@/lib/kpis/cost-of-sales";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "../TemplateForm";
import { DeleteTemplate } from "./DeleteTemplate";

export const metadata = { title: "Plantilla · credIA" };
export const dynamic = "force-dynamic";

export default async function PlantillaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ panel?: string; guardada?: string }> }) {
  const { id } = await params;
  const { panel, guardada } = await searchParams;
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const db = await createClient();
  const t = await getTemplate(db, id);
  if (!t) notFound();
  const team = await loadTeamLayout(db, lender.lenderId);
  const layout = t.layout ? normalizeLayout(t.layout) : team.layout;
  const back = `/plantillas/${t.id}`;

  if (panel === "1" && canEdit) {
    return (
      <main className="w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
        <div className="mb-8 flex flex-col gap-3">
          <div className="text-[13px] text-muted"><Link href="/plantillas">Plantillas</Link> / <Link href={back}>{t.name}</Link> / Panel</div>
          <h1 className="heading-page">{t.name}</h1>
        </div>
        <LayoutEditor
          initial={layout}
          back={back}
          title="Panel del caso de esta plantilla"
          intro={`Los casos creados con «${t.name}» se verán así, salvo los que tengan un diseño propio. ${t.layout ? "Ahora tiene un diseño propio." : "Ahora usa el diseño del equipo."}`}
          targets={[{ target: { kind: "template", id: t.id }, label: "Esta plantilla", hint: "" }]}
          resets={t.layout ? [{ target: { kind: "template", id: t.id }, label: "Usar el diseño del equipo" }] : []}
        />
      </main>
    );
  }

  return (
    <main className="w-full max-w-2xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
          <Link href="/plantillas">Plantillas</Link> / {t.name}
          {guardada && <Pill tone="ok">Guardada</Pill>}
        </div>
        <h1 className="heading-page">{t.name}</h1>
        {canEdit && (
          <div>
            <ButtonLink href={`/casos/nuevo?plantilla=${t.id}`} size="sm">Crear caso con esta plantilla</ButtonLink>
          </div>
        )}
      </div>

      <section aria-labelledby="panel" className="mb-12 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h2 id="panel" className="heading-section">Módulos del panel</h2>
          <Pill tone={t.layout ? "accent" : "neutral"}>{t.layout ? "Diseño propio" : "Diseño del equipo"}</Pill>
          <div className="grow" />
          {canEdit && (
            <Link href={`${back}?panel=1`} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium">
              <LayoutDashboard size={15} strokeWidth={1.8} aria-hidden /> Diseñar el panel
            </Link>
          )}
        </div>
        <p className="text-[15px] text-ink-2">{layout.modules.map((m) => moduleTitle(m) + (m.width === "half" ? " (½)" : "")).join(" · ")}</p>
      </section>

      <TemplateForm
        id={t.id}
        canEdit={canEdit}
        hasOwnPanel={!!t.layout}
        initial={{ name: t.name, description: t.description ?? "", product: t.product ?? "", ...templateFormValues(t.requirements), ...costFormValues(t.costOfSales) }}
      />

      {canEdit && (
        <div className="mt-12">
          <DeleteTemplate id={t.id} />
        </div>
      )}
    </main>
  );
}
