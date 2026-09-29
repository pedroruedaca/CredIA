/** Open list of cases: company, request line, status pill, documents track, relative time, row actions. */
import Link from "next/link";
import { Eye } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { productLabel } from "@/content/products.es";
import { completeness } from "@/lib/cases/requirements";
import { caseRef, formatFigure, relativeTime } from "@/lib/format";
import { NewLinkButton } from "./NewLinkButton";

export interface CaseRow {
  id: string;
  borrower_cif: string;
  borrower_name: string | null;
  status: string;
  updated_at: string;
  requested_product: string | null;
  requested_amount: number | null;
  requested_term_months: number | null;
  case_requirements: { doc_kind: string; required: boolean }[];
  documents: { kind: string; status: string }[];
  holded_connections: { status: string }[];
}

function requestLine(c: CaseRow): string {
  const parts: string[] = [];
  if (c.requested_product) parts.push(productLabel(c.requested_product));
  if (c.requested_amount) {
    const f = formatFigure(Number(c.requested_amount), "EUR");
    parts.push(`${f.number} ${f.unit}`);
  }
  if (c.requested_term_months) parts.push(`${c.requested_term_months} meses`);
  return parts.join(" · ");
}

const iconAction =
  "inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-soft-control hover:text-ink";

export function CaseList({ cases, canEdit, now }: { cases: CaseRow[]; canEdit: boolean; now?: Date }) {
  return (
    <ul aria-label="Casos" className="flex flex-col gap-1">
      {cases.map((c) => {
        const p = completeness(c.case_requirements, c.documents, c.holded_connections);
        const name = c.borrower_name ?? c.borrower_cif;
        const line = requestLine(c);
        return (
          <li
            key={c.id}
            className="-mx-4 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 rounded-row px-4 py-4 transition-colors duration-150 ease-out hover:bg-soft md:grid-cols-[minmax(0,1fr)_auto_130px_90px_auto]"
          >
            <div className="min-w-0">
              <Link href={`/casos/${c.id}/vista-empresa`} className="block truncate text-[17px] font-medium text-ink hover:text-ink">
                {name}
              </Link>
              <div className="truncate text-sm text-muted">
                {line && <span>{line} · </span>}
                <span className="font-mono text-[13px]">{caseRef(c.id)}</span>
              </div>
            </div>
            <div className="justify-self-end md:justify-self-start"><StatusChip status={c.status} /></div>
            <div className="col-span-2 flex items-center gap-3 md:col-span-1" title={`${p.done} de ${p.total} documentos obligatorios`}>
              <div
                className="h-1 grow overflow-hidden rounded-full bg-track"
                role="progressbar"
                aria-valuenow={p.done}
                aria-valuemin={0}
                aria-valuemax={p.total}
                aria-label={`Documentos de ${name}: ${p.done} de ${p.total}`}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${p.pct}%` }} />
              </div>
              <span className="shrink-0 font-mono text-[13px] text-ink-2">{p.done}/{p.total}</span>
            </div>
            <time dateTime={c.updated_at} className="text-sm text-muted">{relativeTime(c.updated_at, now)}</time>
            <div className="flex justify-end gap-1">
              <Link href={`/casos/${c.id}/vista-empresa`} className={iconAction} title="Ver como la empresa">
                <Eye size={18} strokeWidth={1.8} aria-hidden />
                <span className="sr-only">Ver como la empresa ({name})</span>
              </Link>
              {canEdit && <NewLinkButton caseId={c.id} companyName={name} compact />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
