import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { StatusChip } from "@/components/StatusChip";
import { completeness } from "@/lib/cases/requirements";
import { caseRef, formatDate } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { NewLinkButton } from "./NewLinkButton";

export const metadata = { title: "Casos · credIA" };

interface CaseRow {
  id: string;
  borrower_cif: string;
  borrower_name: string | null;
  status: string;
  updated_at: string;
  case_requirements: { doc_kind: string; required: boolean }[];
  documents: { kind: string; status: string }[];
  holded_connections: { status: string }[];
}

export default async function CasosPage() {
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select("id, borrower_cif, borrower_name, status, updated_at, case_requirements(doc_kind, required), documents(kind, status), holded_connections(status)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);
  const cases = (data ?? []) as CaseRow[];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-10">
      <div className="mb-6 flex items-end gap-4">
        <div className="grow">
          <h1 className="heading-page">Casos</h1>
          <p className="mt-2 text-[17px] text-ink-2">Solicitudes en curso y documentación recibida.</p>
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
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th className="border-b border-hairline px-5 py-3 font-medium">Empresa</th>
                <th className="border-b border-hairline px-5 py-3 font-medium">CIF</th>
                <th className="border-b border-hairline px-5 py-3 font-medium">Estado</th>
                <th className="border-b border-hairline px-5 py-3 font-medium">Documentos</th>
                <th className="border-b border-hairline px-5 py-3 font-medium">Actualizado</th>
                <th className="border-b border-hairline px-5 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const p = completeness(c.case_requirements, c.documents, c.holded_connections);
                return (
                  <tr key={c.id} className="border-b border-hairline transition-colors last:border-0 hover:bg-soft">
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.borrower_name ?? "—"}</div>
                      <div className="font-mono text-xs text-muted">{caseRef(c.id)}</div>
                    </td>
                    <td className="px-5 py-3 font-mono">{c.borrower_cif}</td>
                    <td className="px-5 py-3"><StatusChip status={c.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-1 w-24 overflow-hidden rounded-full bg-track"
                          role="progressbar"
                          aria-valuenow={p.pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${p.done} de ${p.total} documentos obligatorios`}
                        >
                          <div className="h-full rounded-full bg-accent" style={{ width: `${p.pct}%` }} />
                        </div>
                        <span className="font-mono text-xs text-ink-2">{p.pct} %</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-2">{formatDate(c.updated_at)}</td>
                    <td className="px-5 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/casos/${c.id}/vista-empresa`}
                          className={buttonClass("secondary", "sm")}
                        >
                          <Eye size={15} strokeWidth={1.8} aria-hidden /> Ver como la empresa
                          <span className="sr-only"> ({c.borrower_name ?? c.borrower_cif})</span>
                        </Link>
                        {canEdit && <NewLinkButton caseId={c.id} companyName={c.borrower_name ?? c.borrower_cif} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
