"use client";

/**
 * "Informe de solvencia" in the case view: the latest commercial report (Experian, Informa…), whether the company or
 * the lender uploaded it. The provider's rating, probability of default and credit limit are shown as the
 * provider's figures, always attributed; incidents and yearly figures link to their page in the PDF. The lender
 * can upload a report from its own subscription here.
 */
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { prepareLenderUpload, registerLenderUpload } from "@/app/casos/[id]/actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Figure } from "@/components/ui/Figure";
import { ListRow } from "@/components/ui/ListRow";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import { INCIDENT_REGISTRY_LABEL, INCIDENT_STATUS_LABEL, JUDICIAL_TYPE_LABEL, PROVIDER_FIGURES_NOTE, SOLVENCY_PROVIDER_LABEL } from "@/content/solvency.es";
import type { CaseViewData } from "@/lib/case-view/load";
import { sourceHref } from "@/lib/case-view/present";
import { formatDate, formatEurWhole, formatFigure } from "@/lib/format";
import { createClient } from "@/lib/supabase/browser";

/** Whole euros in tables, so every row reads on the same scale (Figure switches to M€ above a million). */
const Eur = ({ value }: { value: number | null }) =>
  value === null ? <span className="font-mono text-muted">—</span> : <span className="font-mono tabular-nums">{formatEurWhole(value)}<span className="ml-[0.2em] text-[0.8em] text-muted">€</span></span>;

const BY_LABEL = { borrower: "la empresa", delegate: "la gestoría", lender: "tu entidad" } as const;

/** Lender upload (signed URL straight to Storage, then registered); shared by the button and drag-and-drop. */
function useLenderUpload(caseId: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const upload = (file: File) =>
    start(async () => {
      setError(null);
      if (!/\.pdf$/i.test(file.name)) return setError(`«${file.name}» no es un PDF. Sube el informe en PDF, tal como lo entrega el proveedor.`);
      const prep = await prepareLenderUpload({ caseId, kind: "solvency_report", filename: file.name, size: file.size });
      if (!prep.ok) return setError(prep.message);
      const { error: upErr } = await createClient().storage.from("case-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "application/pdf" });
      if (upErr) return setError("La subida se ha interrumpido. Inténtalo de nuevo.");
      const r = await registerLenderUpload({ caseId, path: prep.path, filename: file.name });
      if (!r.ok) return setError(r.message);
      router.refresh();
      // The report is read in the background: pick up the result without a manual reload.
      for (const ms of [5_000, 15_000, 40_000]) setTimeout(() => router.refresh(), ms);
    });
  return { upload, pending, error };
}

function FileInput({ id, disabled, onFile }: { id: string; disabled: boolean; onFile: (f: File) => void }) {
  return (
    <input
      id={id}
      type="file"
      accept=".pdf,application/pdf"
      disabled={disabled}
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }}
    />
  );
}

/** Drop zone shown when the case has no report yet (same look as the company's portal). */
function DropZone({ inputId, pending, dragOver, onFile }: { inputId: string; pending: boolean; dragOver: boolean; onFile: (f: File) => void }) {
  return (
    <label
      htmlFor={inputId}
      className={cx(
        "relative flex cursor-pointer items-center gap-4 rounded-zone px-5 py-4 transition-colors duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:px-6 sm:py-5",
        dragOver ? "bg-accent-ring" : "bg-accent-tint hover:bg-accent-ring",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-tile">
        {pending ? <Loader2 size={20} className="animate-spin text-accent" aria-hidden /> : <Upload size={20} strokeWidth={2} className="text-accent" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{pending ? "Subiendo el informe…" : "Suelta aquí el informe de solvencia"}</span>
        <span className="text-sm text-ink-2">
          o <span className="text-accent underline underline-offset-[3px]">búscalo en tu equipo</span> · PDF de Experian, Informa, Axesor u otro proveedor
        </span>
      </span>
      <FileInput id={inputId} disabled={pending} onFile={onFile} />
    </label>
  );
}

export function SolvencySection({ caseId, solvency, canEdit, requested }: { caseId: string; solvency: CaseViewData["solvency"]; canEdit: boolean; requested: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { upload, pending, error } = useLenderUpload(caseId);
  const buttonInputId = useId();
  const zoneInputId = useId();
  // The whole section accepts a dropped PDF, so dropping onto the button or the report works too.
  const dropProps = canEdit
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !pending) upload(f);
        },
      }
    : {};
  const r = solvency?.report ?? null;
  const who = r ? (SOLVENCY_PROVIDER_LABEL[r.provider] ?? SOLVENCY_PROVIDER_LABEL.other) : null;
  const src = (page: number | null) => (solvency ? sourceHref(caseId, solvency.docId, page) : undefined);

  let body: React.ReactNode;
  if (!solvency) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-ink-2">{requested ? "Pedido a la empresa; aún no lo ha subido. También puedes subir tú el que tengas." : "No hay informe de solvencia."}</p>
        {canEdit && <DropZone inputId={zoneInputId} pending={pending} dragOver={dragOver} onFile={upload} />}
      </div>
    );
  } else if (!r) {
    body =
      solvency.status === "parsing" || solvency.status === "uploaded" ? (
        <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="info">Leyendo</Pill> Estamos leyendo «{solvency.fileName}».</p>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
          <Pill tone="warn">Revisar</Pill> {solvency.attention ?? `No hemos podido leer «${solvency.fileName}» con seguridad.`}
          <SourcePill href={src(null)}>Abrir PDF</SourcePill>
        </p>
      );
  } else {
    const activeIncidents = r.incidents.filter((i) => i.status !== "resolved");
    const incidents = showAll ? r.incidents : activeIncidents.length ? activeIncidents : r.incidents.slice(0, 5);
    const pd = r.defaultProbability;
    const providerFigures = [
      r.rating && {
        label: `Rating ${who}`,
        value: (
          <span className="font-mono text-[15px]">
            {r.rating.value}
            {r.rating.scale && <span className="ml-1 text-[12px] text-muted">/ {r.rating.scale}</span>}
          </span>
        ),
        sub: r.rating.description,
        page: r.rating.page,
      },
      pd && {
        label: `Probabilidad de impago · ${who}`,
        value: <span className="font-mono text-[15px]">{formatFigure(pd.percent, "%", 2).number} %</span>,
        sub: pd.horizonMonths ? `a ${pd.horizonMonths} meses` : null,
        page: pd.page,
      },
      r.creditLimit && { label: `Límite recomendado · ${who}`, value: <Figure value={r.creditLimit.amount} unit="EUR" className="text-[15px]" />, sub: null, page: r.creditLimit.page },
    ].filter(Boolean) as { label: string; value: React.ReactNode; sub: string | null; page: number | null }[];

    body = (
      <div className="flex flex-col gap-6">
        {providerFigures.length > 0 && (
          <div className="flex flex-col gap-2">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
              {providerFigures.map((f) => (
                <div key={f.label} className="flex min-w-0 flex-col gap-1">
                  <dt className="text-[13px] text-muted">{f.label}</dt>
                  <dd className="flex flex-wrap items-baseline gap-2">
                    {f.value}
                    {f.sub && <span className="text-[13px] text-ink-2">{f.sub}</span>}
                    {f.page && <SourcePill href={src(f.page)} className="min-h-6 px-2 text-[11px]">pág. {f.page}</SourcePill>}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[12px] text-muted">{PROVIDER_FIGURES_NOTE}</p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-muted">Incidencias de pago</h3>
          {r.incidents.length === 0 ? (
            <p className="text-[15px] text-ink-2">
              {r.incidentsTotal?.count
                ? `El informe resume ${r.incidentsTotal.count} incidencias${r.incidentsTotal.amount ? ` por ${formatFigure(r.incidentsTotal.amount, "EUR").number} €` : ""}, sin detalle.`
                : "El informe no recoge incidencias de pago."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {incidents.map((i, n) => (
                <li key={n}>
                  <ListRow className="py-2.5">
                    <SeverityDot tone={i.status === "resolved" ? "neutral" : "high"} className="size-2" />
                    <span className="flex min-w-0 grow flex-col gap-0.5">
                      <span className="truncate text-[15px]">{i.creditor ?? INCIDENT_REGISTRY_LABEL[i.registry]}</span>
                      <span className="text-[13px] text-muted">{[INCIDENT_REGISTRY_LABEL[i.registry], i.date ? formatDate(i.date) : null, INCIDENT_STATUS_LABEL[i.status]].filter(Boolean).join(" · ")}</span>
                    </span>
                    {i.amount !== null && <Figure value={i.amount} unit="EUR" className="text-[15px]" />}
                    <span className="hidden shrink-0 sm:inline-flex"><SourcePill href={src(i.page)} className="min-h-6 px-2 text-[11px]">pág. {i.page}</SourcePill></span>
                  </ListRow>
                </li>
              ))}
            </ul>
          )}
          {r.incidents.length > incidents.length && (
            <Button variant="link" size="sm" className="self-start" onClick={() => setShowAll(true)}>Ver las {r.incidents.length} incidencias, también las resueltas</Button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-muted">Incidencias judiciales y administrativas</h3>
          {r.judicial.length === 0 ? (
            <p className="text-[15px] text-ink-2">El informe no recoge incidencias judiciales ni administrativas.</p>
          ) : (
            <ul className="flex flex-col">
              {r.judicial.map((j, n) => (
                <li key={n}>
                  <ListRow className="items-start py-2.5">
                    <SeverityDot tone={j.status === "resolved" ? "neutral" : j.type === "concurso" || j.type === "embargo" ? "high" : "warn"} className="mt-2 size-2" />
                    <span className="flex min-w-0 grow flex-col gap-0.5">
                      <span className="text-[15px]">{JUDICIAL_TYPE_LABEL[j.type]}</span>
                      <span className="line-clamp-2 text-[13px] text-ink-2">{j.description}</span>
                      <span className="text-[13px] text-muted">{[j.date ? formatDate(j.date) : null, INCIDENT_STATUS_LABEL[j.status]].filter(Boolean).join(" · ")}</span>
                    </span>
                    {j.amount !== null && <Figure value={j.amount} unit="EUR" className="text-[15px]" />}
                    <span className="hidden shrink-0 sm:inline-flex"><SourcePill href={src(j.page)} className="min-h-6 px-2 text-[11px]">pág. {j.page}</SourcePill></span>
                  </ListRow>
                </li>
              ))}
            </ul>
          )}
        </div>

        {r.financials.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-[13px] font-medium text-muted">Cifras según el informe</h3>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-normal">Ejercicio</th>
                  <th className="py-1.5 text-right font-normal">Ventas</th>
                  <th className="py-1.5 text-right font-normal">Resultado</th>
                  <th className="hidden py-1.5 text-right font-normal sm:table-cell">Patrimonio neto</th>
                  <th className="py-1.5 text-right font-normal"><span className="sr-only">Fuente</span></th>
                </tr>
              </thead>
              <tbody>
                {[...r.financials].sort((a, b) => b.fiscalYear - a.fiscalYear).map((f) => (
                  <tr key={f.fiscalYear} className="border-t border-hairline">
                    <td className="py-2 font-mono">{f.fiscalYear}</td>
                    <td className="py-2 text-right"><Eur value={f.revenue} /></td>
                    <td className="py-2 text-right"><Eur value={f.netIncome} /></td>
                    <td className="hidden py-2 text-right sm:table-cell"><Eur value={f.equity} /></td>
                    <td className="py-2 pl-3 text-right"><SourcePill href={src(f.page)} className="min-h-6 px-2 text-[11px]">pág. {f.page}</SourcePill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="solvencia"
      {...dropProps}
      className={cx("-mx-4 flex flex-col gap-4 rounded-row px-4 py-1 transition-colors duration-150", dragOver && solvency && "bg-accent-tint ring-2 ring-accent")}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 id="solvencia" className="heading-section">Informe de solvencia</h2>
        {r && solvency && (
          <span className="text-[13px] text-muted">
            {r.providerName ?? who} · {formatDate(r.reportDate)} · subido por {BY_LABEL[solvency.uploadedBy]}
          </span>
        )}
        <div className="grow" />
        {canEdit && solvency && (
          <label htmlFor={buttonInputId} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-soft-control px-4 text-[13px] font-medium text-ink transition-colors hover:bg-track/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} strokeWidth={1.8} aria-hidden />}
            {pending ? "Subiendo…" : "Subir otro informe"}
            <FileInput id={buttonInputId} disabled={pending} onFile={upload} />
          </label>
        )}
      </div>
      {body}
      {error && <ErrorLine message={error} />}
    </section>
  );
}
