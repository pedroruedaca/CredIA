"use client";

/**
 * "Informe de solvencia" in the case view: the latest commercial report (Experian, Informa…), whether the company or
 * the lender uploaded it. The provider's rating, probability of default and credit limit are shown as the
 * provider's figures, always attributed; incidents and yearly figures link to their page in the PDF. The lender
 * can upload a report from its own subscription here.
 */
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { requestDocument } from "@/app/casos/[id]/actions";
import { DropZone, UploadPill, useLenderUpload } from "@/components/case/LenderUpload";
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

/** Whole euros in tables, so every row reads on the same scale (Figure switches to M€ above a million). */
const Eur = ({ value }: { value: number | null }) =>
  value === null ? <span className="font-mono text-muted">—</span> : <span className="font-mono tabular-nums">{formatEurWhole(value)}<span className="ml-[0.2em] text-[0.8em] text-muted">€</span></span>;

const BY_LABEL = { borrower: "la empresa", delegate: "la gestoría", lender: "tu entidad" } as const;

export function SolvencySection({
  caseId,
  solvency,
  canEdit,
  requested,
}: {
  caseId: string;
  solvency: CaseViewData["solvency"];
  canEdit: boolean;
  /** How it was requested: the lender obtains it by CIF, the company uploads it, or not requested. */
  requested: "cif" | "borrower" | null;
}) {
  const router = useRouter();
  const [asking, startAsk] = useTransition();
  const [askResult, setAskResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const askCompany = () =>
    startAsk(async () => {
      const r = await requestDocument({ caseId, kind: "solvency_report" });
      setAskResult(r);
      if (r.ok) router.refresh();
    });
  const [showAll, setShowAll] = useState(false);
  const { upload, pending, error, dragOver, dropProps } = useLenderUpload(caseId, "solvency_report", (name) => `«${name}» no es un PDF. Sube el informe en PDF, tal como lo entrega el proveedor.`);
  const buttonInputId = useId();
  const zoneInputId = useId();
  const r = solvency?.report ?? null;
  const who = r ? (SOLVENCY_PROVIDER_LABEL[r.provider] ?? SOLVENCY_PROVIDER_LABEL.other) : null;
  const src = (page: number | null) => (solvency ? sourceHref(caseId, solvency.docId, page) : undefined);

  let body: React.ReactNode;
  if (!solvency) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-ink-2">{requested === "cif"
            ? "Por CIF: obtén el informe de tu proveedor (Experian, Informa, Axesor, Iberinform…) con el CIF de la empresa y súbelo aquí."
            : requested
              ? "Pedido a la empresa; aún no lo ha subido. También puedes subir tú el que tengas."
              : "No hay informe de solvencia."}</p>
        {canEdit && (
          <DropZone inputId={zoneInputId} pending={pending} dragOver={dragOver} onFile={upload} title="Suelta aquí el informe de solvencia" pendingTitle="Subiendo el informe…" hint="PDF de Experian, Informa, Axesor u otro proveedor" />
        )}
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
      {...dropProps(canEdit)}
      className={cx("-mx-4 flex flex-col gap-4 rounded-row px-4 py-1 transition-colors duration-150", dragOver && solvency && "bg-accent-tint ring-2 ring-accent")}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 id="solvencia" className="heading-section">Informe de solvencia</h2>
        {r && solvency && (
          <span className="text-[13px] text-muted">
            {r.providerName ?? who} · {formatDate(r.reportDate)} · subido por {BY_LABEL[solvency.uploadedBy]}
          </span>
        )}
        {requested === "cif" && !r && <Pill tone="neutral">Por CIF · pendiente</Pill>}
        <div className="grow" />
        {canEdit && requested === "cif" && !r && (
          <Button variant="link" size="sm" onClick={askCompany} disabled={asking}>{asking ? "Pidiendo…" : "Pedir a la empresa"}</Button>
        )}
        {canEdit && solvency && <UploadPill inputId={buttonInputId} pending={pending} onFile={upload} label="Subir otro informe" />}
      </div>
      {body}
      {askResult?.ok && <p role="status" className="text-[13px] text-ink-2">{askResult.message ?? "Pedido a la empresa; aparecerá en su página."}</p>}
      {askResult && !askResult.ok && <ErrorLine message={askResult.message ?? "No se ha podido pedir."} />}
      {error && <ErrorLine message={error} />}
    </section>
  );
}
