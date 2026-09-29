import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { CaseList, type CaseRow } from "./CaseList";

export const metadata = { title: "Casos · credIA" };

export default async function CasosPage() {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, borrower_cif, borrower_name, status, updated_at, requested_product, requested_amount, requested_term_months, case_requirements(doc_kind, required), documents(kind, status), holded_connections(status)",
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);
  const cases = (data ?? []) as CaseRow[];

  return (
    <main className="w-full max-w-6xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-wrap items-end gap-4">
        <div className="grow">
          <h1 className="heading-page">Casos</h1>
          <p className="mt-3 text-[17px] text-ink-2">Solicitudes en curso y documentación recibida.</p>
        </div>
        <ButtonLink href="/casos/nuevo">
          <Plus size={18} strokeWidth={2} aria-hidden /> Nuevo caso
        </ButtonLink>
      </div>

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2">
          <Pill tone="high">Error</Pill> No hemos podido cargar los casos. Recarga la página; si sigue fallando, avísanos.
        </p>
      ) : cases.length === 0 ? (
        <div className="rounded-panel bg-soft px-8 py-14 text-center">
          <h2 className="heading-section">Aún no tienes casos</h2>
          <p className="mt-1 text-[15px] text-ink-2">Crea un caso para enviar a la empresa su enlace de documentación.</p>
          <ButtonLink href="/casos/nuevo" variant="link">Crear el primer caso</ButtonLink>
        </div>
      ) : (
        <CaseList cases={cases} canEdit={canEdit} />
      )}
    </main>
  );
}
