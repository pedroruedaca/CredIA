import Link from "next/link";
import { listTemplates, templatePolicyIds } from "@/lib/cases/template-store";
import { listParameters } from "@/lib/policies/parameter-store";
import { criteriaParameterIds } from "@/lib/policies/policy";
import { listPolicies } from "@/lib/policies/store";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { NewCaseForm } from "./NewCaseForm";

export const metadata = { title: "Nuevo caso · credIA" };

export default async function NuevoCasoPage({ searchParams }: { searchParams: Promise<{ plantilla?: string }> }) {
  await requireLender();
  const db = await createClient();
  const [templates, policyOf, policies, parameters] = await Promise.all([listTemplates(db), templatePolicyIds(db), listPolicies(db), listParameters(db)]);
  const policyFor = (templateId: string) => policies.find((p) => p.id === policyOf[templateId]) ?? null;
  const caseParameters = parameters;
  // Parameters the template's policy uses: the form requires them.
  const required = (templateId: string) => {
    const ids = criteriaParameterIds(policyFor(templateId)?.criteria ?? []);
    return caseParameters.filter((p) => ids.includes(p.id)).map((p) => p.id);
  };
  const { plantilla } = await searchParams;
  return (
    <main className="w-full max-w-2xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/casos">Casos</Link> / Nuevo</div>
        <h1 className="heading-page">Nuevo caso</h1>
      </div>
      <NewCaseForm
        templates={templates.map((t) => ({ id: t.id, name: t.name, description: t.description, requirements: t.requirements, policyName: policyFor(t.id)?.name ?? null, requiredParameterIds: required(t.id) }))}
        caseParameters={caseParameters.map((p) => ({ id: p.id, name: p.name, unit: p.unit, description: p.description }))}
        initialTemplateId={templates.some((t) => t.id === plantilla) ? plantilla! : ""}
      />
    </main>
  );
}
