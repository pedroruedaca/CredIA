import { Plus } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { CASE_FILTERS, matchesFilter, parseFilter, type CaseFilter } from "@/lib/cases/attention";
import { after } from "next/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireLender } from "@/lib/lender";
import { runStuck, stuckCases } from "@/lib/pipeline/kick";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CaseList, type CaseRow } from "./CaseList";

export const metadata = { title: "Casos · credIA" };
export const dynamic = "force-dynamic";
// Cases found stuck in processing are run again after the response (a few per visit).
export const maxDuration = 300;

const FILTER_LABEL: Record<CaseFilter, string> = {
  todos: "Todos",
  atencion: "Requieren tu atención",
  empresa: "Esperando a la empresa",
  procesando: "Procesando",
};

export default async function CasosPage({ searchParams }: { searchParams: Promise<{ filtro?: string | string[]; eliminado?: string }> }) {
  const params = await searchParams;
  const filter = parseFilter(params.filtro);
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, borrower_cif, borrower_name, status, updated_at, requested_product, requested_amount, requested_term_months, case_requirements(doc_kind, required, source), documents(kind, status), holded_connections(status)",
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);
  const cases = (data ?? []) as CaseRow[];
  // Only cases this lender can see (loaded above through RLS) are checked.
  const admin = createAdminClient();
  const stuck = cases.length ? await stuckCases(admin, cases.map((c) => c.id)) : [];
  if (stuck.length) after(() => runStuck(admin, stuck.slice(0, 3), 240_000));
  const shown = cases.filter((c) => matchesFilter(c, filter));
  const busy = stuck.length > 0 || cases.some((c) => c.status === "processing");

  return (
    <main className="w-full max-w-6xl px-4 py-10 sm:px-14 sm:py-12">
      <AutoRefresh active={busy} everyMs={10_000} />
      <div className="mb-10 flex flex-wrap items-end gap-4">
        <div className="grow">
          <h1 className="heading-page">Casos</h1>
          <p className="mt-3 text-[17px] text-ink-2">Solicitudes en curso y documentación recibida.</p>
          {params.eliminado === "1" && (
            <p role="status" className="mt-3 flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="ok">Eliminado</Pill> El caso y todos sus archivos se han borrado.</p>
          )}
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
        <>
          <nav aria-label="Filtrar casos" className="mb-6 flex flex-wrap gap-2">
            {CASE_FILTERS.map((f) => {
              const n = cases.filter((c) => matchesFilter(c, f)).length;
              const active = f === filter;
              return (
                <Link
                  key={f}
                  href={f === "todos" ? "/casos" : `/casos?filtro=${f}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors duration-150 ease-out hover:no-underline sm:min-h-9",
                    active ? "bg-ink text-white hover:text-white" : "bg-soft-control text-ink hover:bg-track/70 hover:text-ink",
                  )}
                >
                  {FILTER_LABEL[f]}
                  <span className={cx("font-mono", active ? "text-white/70" : "text-muted")}>{n}</span>
                </Link>
              );
            })}
          </nav>
          {shown.length === 0 ? (
            <p className="text-[15px] text-ink-2">
              {filter === "atencion" ? "Nada pendiente por tu parte." : "Ningún caso en este grupo."}{" "}
              <Link href="/casos">Ver todos</Link>
            </p>
          ) : (
            <CaseList cases={shown} canEdit={canEdit} />
          )}
        </>
      )}
    </main>
  );
}
