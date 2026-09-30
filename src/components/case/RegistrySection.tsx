"use client";

/**
 * "Registro Mercantil" in the case view: the company's BORME history once the lender has confirmed which registry
 * sheet it is (officers, capital, latest acts with links to the published announcement), or the candidates found
 * under the case's company name to confirm. Facts only; adverse acts also appear as checks in "Para revisar".
 */
import { useState, useTransition } from "react";
import { setBormeMatch } from "@/app/casos/[id]/actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { Figure } from "@/components/ui/Figure";
import { ListRow } from "@/components/ui/ListRow";
import { SourcePill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import type { CaseRegistry } from "@/lib/borme/case";
import { describeSource } from "@/lib/case-view/present";
import { formatDate } from "@/lib/format";

const TIMELINE_ROWS = 8;

export function RegistrySection({ caseId, companyName, registry, canEdit }: { caseId: string; companyName: string | null; registry: CaseRegistry; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const act = (input: Parameters<typeof setBormeMatch>[0]) =>
    start(async () => {
      setError(null);
      const r = await setBormeMatch(input);
      if (!r.ok) setError(r.message);
    });

  const { coverage, match, candidates, profile } = registry;
  const since = coverage ? `BORME revisado desde ${formatDate(coverage.from)}` : null;
  const change = canEdit && match && (
    <Button variant="link" size="sm" disabled={pending} onClick={() => act({ caseId, status: "clear" })}>Cambiar</Button>
  );

  let body: React.ReactNode;
  if (!coverage) {
    body = <p className="text-[15px] text-ink-2">El BORME aún no se ha importado. La historia registral aparecerá aquí cuando lo esté.</p>;
  } else if (profile) {
    const timeline = showAll ? profile.timeline : profile.timeline.slice(0, TIMELINE_ROWS);
    body = (
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {[
            ["Razón social", <span key="n" className="text-[15px] font-medium">{profile.name}</span>],
            ["Hoja registral", <span key="h" className="font-mono text-[15px]">{profile.sheet}</span>],
            ["Constitución", <span key="c" className="font-mono text-[15px]">{profile.constitutedOn ? formatDate(profile.constitutedOn) : `Antes de ${formatDate(coverage.from)}`}</span>],
            ["Capital", profile.capital ? <Figure key="k" value={profile.capital.amount} unit="EUR" className="text-[15px]" /> : <span key="k" className="text-[15px] text-muted">Sin datos</span>],
          ].map(([label, value]) => (
            <div key={label as string} className="flex min-w-0 flex-col gap-1">
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {profile.formerNames.length > 0 && <p className="-mt-3 text-[13px] text-muted">Antes: {profile.formerNames.join(" · ")}</p>}

        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-muted">Cargos vigentes</h3>
          {profile.officers.length === 0 ? (
            <p className="text-[15px] text-ink-2">No hay nombramientos publicados en el periodo importado.</p>
          ) : (
            <ul className="flex flex-col">
              {profile.officers.map((o) => (
                <li key={`${o.role}|${o.name}`}>
                  <ListRow className="py-2.5">
                    <span className="min-w-0 grow truncate text-[15px]">{o.name}</span>
                    <span className="text-[13px] text-ink-2">{o.role}</span>
                    <span className="w-24 text-right font-mono text-[13px] text-muted">{o.since ? formatDate(o.since) : "—"}</span>
                  </ListRow>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-muted">Actos publicados</h3>
          <ul className="flex flex-col">
            {timeline.map((t, i) => {
              const src = describeSource(t.source, []);
              return (
                <li key={`${t.source}-${i}`}>
                  <ListRow className="items-start py-2.5">
                    <span className="w-24 shrink-0 pt-0.5 font-mono text-[13px] text-muted">{formatDate(t.date)}</span>
                    <span className="flex min-w-0 grow flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-[15px] font-medium">
                        {t.severity && <SeverityDot tone={t.severity} className="size-2" />}
                        {t.label}
                      </span>
                      {t.text && <span className="line-clamp-2 text-[13px] text-ink-2">{t.text}</span>}
                    </span>
                    <SourcePill href={src.url} className="hidden shrink-0 sm:inline-flex">{`anuncio ${t.source.split(":").at(-1)}`}</SourcePill>
                  </ListRow>
                </li>
              );
            })}
          </ul>
          {profile.timeline.length > TIMELINE_ROWS && (
            <Button variant="link" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Ver menos" : `Ver los ${profile.timeline.length} actos`}
            </Button>
          )}
        </div>
      </div>
    );
  } else if (match?.status === "none") {
    body = <p className="text-[15px] text-ink-2">Marcaste que la empresa no está entre los resultados del BORME.</p>;
  } else if (!companyName) {
    body = <p className="text-[15px] text-ink-2">El caso no tiene razón social: sin ella no se puede buscar la empresa en el BORME.</p>;
  } else if (candidates.length === 0) {
    body = <p className="text-[15px] text-ink-2">No hay anuncios en el BORME a nombre de «{companyName}» desde el {formatDate(coverage.from)}.</p>;
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-ink-2">
          {candidates.length === 1 ? "Hemos encontrado esta empresa" : `Hemos encontrado ${candidates.length} empresas`} con la razón social del caso. Confirma cuál es: el BORME no publica el CIF.
        </p>
        <ul className="flex flex-col">
          {candidates.map((c) => (
            <li key={c.sheet}>
              <ListRow className="py-3">
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate text-[15px] font-medium">{c.name}</span>
                  <span className="text-[13px] text-muted">
                    {c.province} · hoja <span className="font-mono">{c.sheet}</span> · {c.acts} {c.acts === 1 ? "acto" : "actos"} · último {formatDate(c.lastSeen)}
                  </span>
                </span>
                {canEdit && (
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => act({ caseId, status: "confirmed", sheet: c.sheet })}>
                    Es esta
                  </Button>
                )}
              </ListRow>
            </li>
          ))}
        </ul>
        {canEdit && (
          <Button variant="link" size="sm" className="self-start" disabled={pending} onClick={() => act({ caseId, status: "none" })}>
            Ninguna es la empresa del caso
          </Button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="registro" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="registro" className="heading-section">Registro Mercantil</h2>
        {since && <span className="text-[13px] text-muted">{since}</span>}
        <div className="grow" />
        {change}
      </div>
      {body}
      {error && <ErrorLine message={error} />}
    </section>
  );
}
