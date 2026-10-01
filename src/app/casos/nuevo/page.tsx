import Link from "next/link";
import { listTemplates } from "@/lib/cases/template-store";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { NewCaseForm } from "./NewCaseForm";

export const metadata = { title: "Nuevo caso · credIA" };

export default async function NuevoCasoPage({ searchParams }: { searchParams: Promise<{ plantilla?: string }> }) {
  await requireLender();
  const templates = await listTemplates(await createClient());
  const { plantilla } = await searchParams;
  return (
    <main className="w-full max-w-2xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/casos">Casos</Link> / Nuevo</div>
        <h1 className="heading-page">Nuevo caso</h1>
      </div>
      <NewCaseForm
        templates={templates.map((t) => ({ id: t.id, name: t.name, description: t.description, product: t.product, requirements: t.requirements }))}
        initialTemplateId={templates.some((t) => t.id === plantilla) ? plantilla! : ""}
      />
    </main>
  );
}
