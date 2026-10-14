/** The team's standard case-view panel, designed without opening a case (owners and analysts). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutEditor } from "@/components/case/modules/LayoutEditor";
import { loadTeamLayout } from "@/lib/case-view/layout-store";
import { listTemplates } from "@/lib/cases/template-store";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Panel estándar del equipo · credIA" };
export const dynamic = "force-dynamic";

export default async function PanelEquipoPage() {
  const lender = await requireLender();
  if (lender.role === "viewer") redirect("/plantillas");
  const db = await createClient();
  const [team, templates] = await Promise.all([loadTeamLayout(db, lender.lenderId), listTemplates(db)]);
  const using = templates.filter((t) => !t.layout).length;
  return (
    <main className="w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-8 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/plantillas">Plantillas</Link> / Panel estándar del equipo</div>
        <h1 className="heading-page">Panel estándar del equipo</h1>
      </div>
      <LayoutEditor
        initial={team.layout}
        back="/plantillas"
        title="Panel estándar del equipo"
        intro={`Lo ven los casos sin diseño propio cuya plantilla no tiene panel propio${using ? ` (${using} ${using === 1 ? "plantilla lo usa" : "plantillas lo usan"})` : ""}, y los casos sin plantilla. ${team.custom ? "Ahora tiene un diseño del equipo." : "Ahora es el diseño original de credIA."}`}
        targets={[{ target: { kind: "team" }, label: "Todo el equipo", hint: "" }]}
        resets={team.custom ? [{ target: { kind: "team" }, label: "Restaurar el diseño original para el equipo" }] : []}
      />
    </main>
  );
}
