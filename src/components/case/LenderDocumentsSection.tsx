"use client";

/**
 * "Documentos que subes tú": the documents the analyst marked as "Lo subo yo" when creating the case (other than the
 * cuentas anuales and the informe de solvencia, which have their own sections). The company's portal does not ask for
 * them. Each row shows what was uploaded and its reading state, takes the files (same formats as the company's
 * portal), or hands the document to the company ("Pedir a la empresa").
 */
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { requestDocument, type LenderUploadKind } from "@/app/casos/[id]/actions";
import { DropZone, UploadPill, useLenderUpload } from "@/components/case/LenderUpload";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { UPLOAD_RULES } from "@/lib/borrower/upload-rules";
import type { CaseViewData } from "@/lib/case-view/load";
import { sourceHref } from "@/lib/case-view/present";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";

/** Kinds with their own section in the case view. */
const OWN_SECTION = new Set(["cuentas_anuales", "solvency_report"]);

type Doc = CaseViewData["documents"][number];

export function LenderDocumentsSection({ caseId, data, canEdit }: { caseId: string; data: CaseViewData; canEdit: boolean }) {
  const kinds = data.requirements.filter((r) => r.source === "lender" && !OWN_SECTION.has(r.doc_kind)).map((r) => r.doc_kind as LenderUploadKind);
  if (kinds.length === 0) return null;
  const pending = kinds.filter((k) => !data.documents.some((d) => d.kind === k && d.status !== "failed")).length;
  return (
    <section aria-labelledby="documentos-analista" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="documentos-analista" className="heading-section">Documentos que subes tú</h2>
        <span className="text-[13px] text-muted">{pending === 0 ? "todos subidos" : `${pending} pendiente${pending === 1 ? "" : "s"}`} · no se piden a la empresa</span>
      </div>
      <ul className="flex flex-col gap-1">
        {kinds.map((kind) => (
          <LenderDocumentRow key={kind} caseId={caseId} kind={kind} docs={data.documents.filter((d) => d.kind === kind)} canEdit={canEdit} />
        ))}
      </ul>
    </section>
  );
}

const STATE: Record<string, { tone: "ok" | "info" | "warn"; label: string }> = {
  parsed: { tone: "ok", label: "Leído" },
  uploaded: { tone: "info", label: "Recibido" },
  parsing: { tone: "info", label: "Leyendo…" },
  needs_review: { tone: "warn", label: "Revisar" },
  failed: { tone: "warn", label: "No leído" },
};

function LenderDocumentRow({ caseId, kind, docs, canEdit }: { caseId: string; kind: LenderUploadKind; docs: Doc[]; canEdit: boolean }) {
  const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
  const rule = UPLOAD_RULES[kind];
  const router = useRouter();
  const { upload, pending, error, dragOver, dropProps } = useLenderUpload(caseId, kind);
  const [asking, startAsk] = useTransition();
  const [askResult, setAskResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const zoneId = useId();
  const pillId = useId();
  const askCompany = () =>
    startAsk(async () => {
      const r = await requestDocument({ caseId, kind });
      setAskResult(r);
      if (r.ok) router.refresh();
    });
  const usable = docs.filter((d) => d.status !== "failed");

  return (
    <li {...dropProps(canEdit)} className={cx("-mx-4 flex flex-col gap-2.5 rounded-row px-4 py-3 transition-colors duration-150", dragOver && "bg-accent-tint ring-2 ring-accent")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="text-[15px] font-medium">{spec.label}</span>
        {usable.length === 0 && <Pill tone="neutral">Pendiente</Pill>}
        <div className="grow" />
        {canEdit && usable.length === 0 && (
          <Button variant="link" size="sm" onClick={askCompany} disabled={asking}>{asking ? "Pidiendo…" : "Pedir a la empresa"}</Button>
        )}
        {canEdit && docs.length > 0 && <UploadPill inputId={pillId} pending={pending} onFile={upload} kind={kind} label={rule.multiple ? "Subir más" : "Subir otro"} />}
      </div>
      {docs.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {docs.map((d) => {
            const st = STATE[d.status] ?? STATE.uploaded;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <SourcePill href={sourceHref(caseId, d.id, null)} className="min-h-6 px-2 text-[12px]">{d.original_filename ?? "documento"}</SourcePill>
                <Pill tone={st.tone} className="h-6 text-[12px]">{st.label}</Pill>
                {d.attention_message && (d.status === "failed" || d.status === "needs_review") && <span>{d.attention_message}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        canEdit && (
          <DropZone
            inputId={zoneId}
            pending={pending}
            dragOver={dragOver}
            onFile={upload}
            kind={kind}
            title={`Suelta aquí ${rule.multiple ? "los ficheros" : "el fichero"}: ${spec.label}`}
            pendingTitle="Subiendo…"
            hint={rule.acceptLabel}
          />
        )
      )}
      {askResult?.ok && <p role="status" className="text-[13px] text-ink-2">{askResult.message}</p>}
      {askResult && !askResult.ok && <ErrorLine message={askResult.message ?? "No se ha podido pedir."} />}
      {error && <ErrorLine message={error} />}
    </li>
  );
}
