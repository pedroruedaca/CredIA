/**
 * «Identidad y titularidad» in the case view: the company as registered, who runs it today and the KYB checks, from
 * the nota simple and the confirmed BORME history (see src/lib/case-view/identity.ts). Facts with their source; the
 * checks open the evidence panel, as in «Para revisar». Nothing here scores or decides.
 */
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { ListRow, listRowClass } from "@/components/ui/ListRow";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import { cx } from "@/components/ui/cx";
import { CHECK_PASS_LABEL, REVIEW_LABEL } from "@/content/case-view.es";
import { IDENTITY_COPY } from "@/content/identity.es";
import type { IdentityView } from "@/lib/case-view/identity";
import { describeSource, sourceHref, type SourceDoc } from "@/lib/case-view/present";
import { formatDay } from "@/lib/format";

function Source({ caseId, refStr, docs }: { caseId: string; refStr: string | null; docs: SourceDoc[] }) {
  if (!refStr) return null;
  const s = describeSource(refStr, docs);
  return <SourcePill href={sourceHref(caseId, s.docId, s.page, s.url)}>{s.label}</SourcePill>;
}

function NotaLine({ caseId, view }: { caseId: string; view: IdentityView }) {
  const n = view.nota;
  switch (n.kind) {
    case "parsed":
      return <SourcePill href={sourceHref(caseId, n.docId, null)}>{IDENTITY_COPY.notaParsed(formatDay(n.issuedOn))}</SourcePill>;
    case "reading":
      return <Pill tone="info">{IDENTITY_COPY.notaReading}</Pill>;
    case "failed":
      return <Pill tone="warn">{IDENTITY_COPY.notaFailed}</Pill>;
    case "requested":
      return <Pill tone="neutral">{n.from === "lender" ? IDENTITY_COPY.notaYours : IDENTITY_COPY.notaRequested}</Pill>;
    default:
      return <span className="text-[13px] text-muted">{IDENTITY_COPY.notaNone}</span>;
  }
}

export function IdentitySection({ caseId, view, docs, check }: { caseId: string; view: IdentityView; docs: SourceDoc[]; check: string | null }) {
  const members = view.board?.members ?? [];
  return (
    <section aria-labelledby="identidad" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h2 id="identidad" className="heading-section">Identidad y titularidad</h2>
        <div className="grow" />
        <NotaLine caseId={caseId} view={view} />
      </div>
      {view.nota.kind === "failed" && view.nota.attention && <p className="-mt-3 text-[13px] text-ink-2">{view.nota.attention}</p>}

      <div className="flex flex-col gap-1">
        <p className="text-[17px] font-medium tracking-[-0.01em]">{view.name}</p>
        {view.formerNames.length > 0 && <p className="text-[13px] text-muted">{IDENTITY_COPY.formerNames(view.formerNames)}</p>}
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {view.facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[13px] text-muted">{f.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={cx("break-words text-[15px]", f.mono && "font-mono")}>{f.value}</span>
              <Source caseId={caseId} refStr={f.source} docs={docs} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-medium text-muted">{IDENTITY_COPY.boardTitle}{view.boardBasis ? ` · ${view.boardBasis}` : ""}</h3>
        {!view.board ? (
          <p className="text-[15px] text-ink-2">{IDENTITY_COPY.boardUnknown}</p>
        ) : members.length === 0 ? (
          <p className="text-[15px] text-ink-2">{IDENTITY_COPY.boardEmpty}</p>
        ) : (
          <ul className="flex flex-col">
            {members.map((m) => (
              <li key={`${m.kind}|${m.name}|${m.role}`}>
                <ListRow className="py-2.5">
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-[15px]">{m.name}</span>
                    {/* Phones: role and date under the name instead of in columns. */}
                    <span className="text-[13px] text-ink-2 sm:hidden">
                      {m.role}
                      {m.since && <> · <span className="font-mono text-muted">{formatDay(m.since)}</span></>}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[13px] text-ink-2 sm:inline">{m.role}</span>
                  <span className="hidden w-24 shrink-0 text-right font-mono text-[13px] text-muted sm:inline">{m.since ? formatDay(m.since) : "—"}</span>
                  <span className="hidden shrink-0 sm:inline-flex"><Source caseId={caseId} refStr={m.source} docs={docs} /></span>
                </ListRow>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(view.open.length > 0 || view.passed.length > 0) && (
        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-muted">{IDENTITY_COPY.checksTitle}</h3>
          <ul className="flex flex-col gap-1">
            {view.open.map((v) => {
              const reviewed = v.review && v.review.status !== "open";
              return (
                <li key={v.slug}>
                  <Link
                    href={`?check=${encodeURIComponent(v.slug)}`}
                    scroll={false}
                    aria-current={v.slug === check ? "true" : undefined}
                    className={listRowClass(v.slug === check, true, "gap-3.5 py-3 text-ink hover:text-ink hover:no-underline")}
                  >
                    <SeverityDot tone={v.severity} className={cx("size-2.5", reviewed && "opacity-40")} />
                    <span className={cx("line-clamp-2 min-w-0 grow text-[15px]", reviewed && "text-ink-2")}>{v.message}</span>
                    {reviewed && <Pill tone={v.review!.status === "reviewed" ? "ok" : "info"} className="hidden sm:inline-flex">{REVIEW_LABEL[v.review!.status]}</Pill>}
                    <ChevronRight size={18} strokeWidth={2} className={cx("shrink-0", v.slug === check ? "text-ink" : "text-faint")} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {view.passed.length > 0 && (
            <ul aria-label="Verificaciones de identidad correctas" className="flex flex-wrap gap-2 pt-1.5">
              {view.passed.map((v) => (
                <li key={v.slug}><Pill tone="ok" dot={false} className="font-normal"><Check size={14} strokeWidth={2.2} aria-hidden />{CHECK_PASS_LABEL[v.key] ?? v.name}</Pill></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[13px] text-muted">{IDENTITY_COPY.footnote}</p>
    </section>
  );
}
