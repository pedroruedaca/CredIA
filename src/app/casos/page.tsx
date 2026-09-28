import Link from "next/link";
import { Plus } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { completeness } from "@/lib/cases/requirements";
import { caseRef, formatDate } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

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
  await requireLender();
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
          <h1 className="font-serif text-[34px] font-semibold tracking-tight">Casos</h1>
          <p className="text-sm text-ink-2">Solicitudes en curso y documentación recibida.</p>
        </div>
        <Link
          href="/casos/nuevo"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover hover:text-white hover:no-underline"
        >
          <Plus size={18} aria-hidden /> Nuevo caso
        </Link>
      </div>

      {error ? (
        <div role="alert" className="rounded-card bg-high-bg p-5 text-sm text-high">
          No hemos podido cargar los casos. Recarga la página; si sigue fallando, avísanos.
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <h2 className="text-[17px] font-semibold">Aún no tienes casos</h2>
          <p className="mt-1 text-sm text-ink-2">Crea un caso para enviar a la empresa su enlace de documentación.</p>
          <Link href="/casos/nuevo" className="mt-4 inline-block text-sm font-medium">Crear el primer caso</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.04em] text-muted">
                <th className="border-b border-line px-5 py-3 font-medium">Empresa</th>
                <th className="border-b border-line px-5 py-3 font-medium">CIF</th>
                <th className="border-b border-line px-5 py-3 font-medium">Estado</th>
                <th className="border-b border-line px-5 py-3 font-medium">Documentos</th>
                <th className="border-b border-line px-5 py-3 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const p = completeness(c.case_requirements, c.documents, c.holded_connections);
                return (
                  <tr key={c.id} className="border-b border-line-row last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.borrower_name ?? "—"}</div>
                      <div className="font-mono text-xs text-muted">{caseRef(c.id)}</div>
                    </td>
                    <td className="px-5 py-3 font-mono">{c.borrower_cif}</td>
                    <td className="px-5 py-3"><StatusChip status={c.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-1.5 w-24 overflow-hidden rounded-full bg-line-row"
                          role="progressbar"
                          aria-valuenow={p.pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${p.done} de ${p.total} documentos obligatorios`}
                        >
                          <div className="h-full bg-accent" style={{ width: `${p.pct}%` }} />
                        </div>
                        <span className="font-mono text-xs text-ink-2">{p.pct} %</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-2">{formatDate(c.updated_at)}</td>
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
