"use client";

/**
 * "Cuentas anuales" in the case view: whether they were obtained (uploaded by the analyst or by the company),
 * which year and model, and whether they are the basis of the closed year (no trial balance or Holded). When the
 * analyst provides them ("Lo subo yo"), it uploads the PDF here — the deposit from the Registro Mercantil or its
 * provider's copy — or hands the request to the company.
 */
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { requestDocument } from "@/app/casos/[id]/actions";
import { DropZone, UploadPill, useLenderUpload } from "@/components/case/LenderUpload";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Pill, SourcePill } from "@/components/ui/Pill";
import type { CaseViewData } from "@/lib/case-view/load";
import { sourceHref } from "@/lib/case-view/present";
import { formatDate } from "@/lib/format";

const BY_LABEL = { borrower: "la empresa", delegate: "la gestoría", lender: "el analista" } as const;
const MODEL_LABEL = { normal: "modelo normal", abreviado: "modelo abreviado", pymes: "modelo PYMES", other: "otro formato" } as const;

export function AnnualAccountsSection({
  caseId,
  data,
  source,
  isClosedYearBasis,
  canEdit,
}: {
  caseId: string;
  data: CaseViewData["annualAccounts"];
  /** How they were requested: the analyst uploads them ("Lo subo yo"), from the company, or not requested. */
  source: "lender" | "borrower" | null;
  isClosedYearBasis: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { upload, pending, error, dragOver, dropProps } = useLenderUpload(caseId, "cuentas_anuales", (name) => `«${name}» no es un PDF. Sube las cuentas anuales en PDF, tal como se descargan del Registro Mercantil.`);
  const [asking, startAsk] = useTransition();
  const [askResult, setAskResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const zoneInputId = useId();
  const buttonInputId = useId();
  if (!data && !source) return null;

  const a = data?.accounts ?? null;
  const askCompany = () =>
    startAsk(async () => {
      const r = await requestDocument({ caseId, kind: "cuentas_anuales" });
      setAskResult(r);
      if (r.ok) router.refresh();
    });

  let status: React.ReactNode;
  let body: React.ReactNode = null;
  if (!data) {
    status = source === "lender" ? <Pill tone="neutral">Lo subes tú · pendiente</Pill> : <Pill tone="neutral">Pedidas a la empresa</Pill>;
    body = (
      <div className="flex flex-col gap-3">
        <p className="max-w-[640px] text-[15px] text-ink-2">
          {source === "lender"
            ? "Obtén el depósito de cuentas con el CIF de la empresa en el Registro Mercantil o en tu proveedor y súbelo aquí. Sin sumas y saldos, el ejercicio cerrado se construye con ellas."
            : "La empresa aún no las ha subido. También puedes subirlas tú."}
        </p>
        {canEdit && <DropZone inputId={zoneInputId} pending={pending} dragOver={dragOver} onFile={upload} title="Suelta aquí las cuentas anuales" pendingTitle="Subiendo las cuentas anuales…" hint="PDF del depósito en el Registro Mercantil" />}
      </div>
    );
  } else if (!a) {
    status =
      data.status === "parsing" || data.status === "uploaded" ? (
        <Pill tone="info">Leyendo…</Pill>
      ) : (
        <Pill tone="warn">No leídas</Pill>
      );
    if (data.status !== "parsing" && data.status !== "uploaded") {
      body = (
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
          {data.attention ?? `No hemos podido leer «${data.fileName}» con seguridad.`}
          <SourcePill href={sourceHref(caseId, data.docId, null)}>Abrir PDF</SourcePill>
        </p>
      );
    }
  } else {
    status = <Pill tone="ok">Obtenidas · ejercicio {a.fiscalYear}</Pill>;
    body = (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2">
        <span>
          {[MODEL_LABEL[a.model], a.periodEnd ? `cierre ${formatDate(a.periodEnd)}` : null, a.hasPrior ? "con el ejercicio anterior" : null, `subidas por ${BY_LABEL[data.uploadedBy]}`].filter(Boolean).join(" · ")}.{" "}
          {isClosedYearBasis ? "Son la base del ejercicio cerrado: no hay sumas y saldos ni Holded para ese año." : "El ejercicio cerrado sale de la contabilidad, que tiene prioridad."}
        </span>
        {a.pages.balanceSheet && <SourcePill href={sourceHref(caseId, data.docId, a.pages.balanceSheet)} className="min-h-6 px-2 text-[11px]">Balance · pág. {a.pages.balanceSheet}</SourcePill>}
        {a.pages.incomeStatement && <SourcePill href={sourceHref(caseId, data.docId, a.pages.incomeStatement)} className="min-h-6 px-2 text-[11px]">Pérdidas y ganancias · pág. {a.pages.incomeStatement}</SourcePill>}
      </p>
    );
  }

  return (
    <section
      aria-labelledby="cuentas-anuales"
      {...dropProps(canEdit)}
      className={cx("-mx-4 flex flex-col gap-3 rounded-row px-4 py-1 transition-colors duration-150", dragOver && data && "bg-accent-tint ring-2 ring-accent")}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 id="cuentas-anuales" className="heading-section">Cuentas anuales</h2>
        {status}
        <div className="grow" />
        {canEdit && source === "lender" && !a && (
          <Button variant="link" size="sm" onClick={askCompany} disabled={asking}>{asking ? "Pidiendo…" : "Pedir a la empresa"}</Button>
        )}
        {canEdit && data && <UploadPill inputId={buttonInputId} pending={pending} onFile={upload} label="Subir otras" />}
      </div>
      {body}
      {askResult?.ok && <p role="status" className="text-[13px] text-ink-2">{askResult.message ?? "Pedidas a la empresa; aparecerán en su página."}</p>}
      {askResult && !askResult.ok && <ErrorLine message={askResult.message ?? "No se han podido pedir."} />}
      {error && <ErrorLine message={error} />}
    </section>
  );
}
