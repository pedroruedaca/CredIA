/**
 * Lender case view body (design/lender-case-view2.html): header, summary sentence, five metrics, "Para revisar"
 * with the evidence panel (?check=<slug>), balance structure with lineage, sources. Nothing here scores or recommends.
 */
import Link from "next/link";
import { Check, ChevronRight, Eye } from "lucide-react";
import { BalanceBars } from "@/components/case/BalanceBars";
import { ExportMenu, RequestDocumentButton } from "@/components/case/CaseActions";
import { DetailsSheet } from "@/components/case/DetailsSheet";
import { EvidencePanel } from "@/components/case/EvidencePanel";
import { KpiRow } from "@/components/case/KpiRow";
import { StatusChip } from "@/components/StatusChip";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import { cx } from "@/components/ui/cx";
import { CHECK_PASS_LABEL, REVIEW_LABEL } from "@/content/case-view.es";
import { productLabel } from "@/content/products.es";
import type { CaseViewData } from "@/lib/case-view/load";
import { buildPackage } from "@/lib/case-view/package";
import { sourceHref } from "@/lib/case-view/present";
import { caseRef, formatCompactEur, formatDate, formatFigure, relativeTime } from "@/lib/format";

export function CaseView({ data, check, canEdit, userId, now = new Date() }: { data: CaseViewData; check: string | null; canEdit: boolean; userId: string; now?: Date }) {
  const { kase } = data;
  const pkg = buildPackage(data);
  const amount = kase.amount ? formatFigure(kase.amount, "EUR") : null;
  const hasFinancials = pkg.basePeriod !== null;
  const reviewedCount = pkg.open.filter((v) => v.review && v.review.status !== "open").length;
  

  const company = [
    { label: "Razón social", value: kase.companyName },
    { label: "CIF", value: kase.cif, mono: true },
    { label: "Producto", value: kase.product ? productLabel(kase.product) : "—" },
    { label: "Importe", value: amount ? `${amount.number} ${amount.unit}` : "—" },
    { label: "Plazo", value: kase.termMonths ? `${kase.termMonths} meses` : "—" },
    { label: "Cierre del ejercicio", value: formatDate(kase.fiscalYearEnd) },
    { label: "Correo de la empresa", value: kase.borrowerEmail ?? "—" },
    {
      label: "Enlace",
      value: kase.consentWithdrawnAt
        ? `Consentimiento retirado el ${formatDate(kase.consentWithdrawnAt)}`
        : !kase.linkExpiresAt
          ? "Sin enlace activo"
          : new Date(kase.linkExpiresAt) <= now
            ? `Caducó el ${formatDate(kase.linkExpiresAt)}`
            : `Caduca el ${formatDate(kase.linkExpiresAt)}`,
    },
    { label: "Enviado", value: kase.submittedAt ? formatDate(kase.submittedAt) : "Aún no" },
    { label: "Datos calculados", value: kase.processedAt ? relativeTime(kase.processedAt, now) : "—" },
    { label: "Creado", value: formatDate(kase.createdAt) },
  ];

  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14">
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
            <nav aria-label="Ruta" className="flex items-center gap-2.5">
              <Link href="/casos" className="text-muted hover:text-ink">Casos</Link>
              <span aria-hidden>/</span>
              <span className="font-mono" aria-current="page">{caseRef(kase.id)}</span>
            </nav>
            <StatusChip status={kase.status} />
            <span className="grow" />
            <DetailsSheet
              company={company}
              activity={data.activity.map((a) => ({ action: a.action, actor: a.actor, at: a.at, when: relativeTime(a.at, now) }))}
              currentUserId={userId}
            />
            <Link href={`/casos/${kase.id}/vista-empresa`} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium">
              <Eye size={15} strokeWidth={1.8} aria-hidden /> Ver como la empresa
            </Link>
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">{kase.companyName}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <p className="text-[15px] text-ink-2">
              {[
                kase.product ? <span key="p">{productLabel(kase.product)}</span> : null,
                amount ? <b key="a" className="font-semibold text-ink">{amount.number} {amount.unit}</b> : null,
                kase.termMonths ? <span key="t">{kase.termMonths} meses</span> : null,
                <span key="c">CIF <span className="font-mono">{kase.cif}</span></span>,
              ]
                .filter(Boolean)
                .flatMap((el, i) => (i === 0 ? [el] : [" · ", el]))}
            </p>
            <div className="grow" />
            {canEdit && <RequestDocumentButton caseId={kase.id} companyName={kase.companyName} requested={data.requirements.filter((r) => r.required).map((r) => r.doc_kind)} />}
            <ExportMenu caseId={kase.id} />
          </div>
        </header>

        {kase.status === "processing" && (
          <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="info">Procesando</Pill> Estamos leyendo los documentos; las cifras se actualizarán al terminar.</p>
        )}

        {!hasFinancials ? (
          <div className="rounded-panel bg-soft px-8 py-12 text-center">
            <h2 className="heading-section">Aún no hay contabilidad procesada</h2>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-ink-2">
              Las cifras, indicadores y verificaciones aparecerán cuando la empresa suba su sumas y saldos o conecte Holded.
            </p>
            <Link href={`/casos/${kase.id}/vista-empresa`} className="mt-2 inline-flex min-h-11 items-center text-[15px]">Ver qué ha subido la empresa</Link>
          </div>
        ) : (
          <>
            {pkg.summary && (
              <p className="max-w-[720px] text-[19px] leading-normal tracking-[-0.01em] text-ink-2 sm:text-[22px]">
                {pkg.summary.map((s, i) =>
                  s.emphasis === "figure" ? <b key={i} className="font-semibold text-ink">{s.text}</b> : s.emphasis === "discrepancy" ? <b key={i} className="font-semibold text-high">{s.text}</b> : <span key={i}>{s.text}</span>,
                )}
              </p>
            )}
            {pkg.tiles.length > 0 && <KpiRow tiles={pkg.tiles} />}
          </>
        )}

        <section aria-labelledby="para-revisar" className="flex flex-col gap-1">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5">
            <h2 id="para-revisar" className="heading-section">Para revisar</h2>
            <span className={cx("text-[13px] text-muted", pkg.open.length + pkg.passed.length === 0 && "hidden")}>
              {pkg.open.length} {pkg.open.length === 1 ? "abierta" : "abiertas"}
              {reviewedCount > 0 && ` (${reviewedCount} revisada${reviewedCount === 1 ? "" : "s"})`} · {pkg.passed.length} {pkg.passed.length === 1 ? "verificación correcta" : "verificaciones correctas"}
            </span>
          </div>
          {pkg.open.length === 0 && (
            <p className="text-[15px] text-ink-2">{hasFinancials ? "No hay alertas abiertas." : "Las verificaciones aparecerán cuando haya datos."}</p>
          )}
          <ul className="flex flex-col gap-1">
            {pkg.open.map((v) => {
              const selected = v.slug === check;
              const reviewed = v.review && v.review.status !== "open";
              return (
                <li key={v.slug}>
                  <Link
                    href={`?check=${encodeURIComponent(v.slug)}`}
                    scroll={false}
                    aria-current={selected ? "true" : undefined}
                    className={cx(
                      "-mx-4 flex items-center gap-3.5 rounded-row px-4 py-3.5 text-ink transition-colors duration-150 hover:bg-soft hover:text-ink hover:no-underline",
                      selected && "bg-soft",
                    )}
                  >
                    <SeverityDot tone={v.severity} className={cx("size-2.5", reviewed && "opacity-40")} />
                    <span className="flex min-w-0 grow flex-col gap-0.5">
                      <span className={cx("line-clamp-2 text-[15px] font-medium", reviewed && "text-ink-2")}>{v.message}</span>
                      <span className="truncate text-[13px] text-muted">{[v.name, v.evidenceLine].filter(Boolean).join(" · ")}</span>
                    </span>
                    {reviewed && <Pill tone={v.review!.status === "reviewed" ? "ok" : "info"} className="hidden sm:inline-flex">{REVIEW_LABEL[v.review!.status]}</Pill>}
                    <ChevronRight size={18} strokeWidth={2} className={selected ? "text-ink" : "text-faint"} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {pkg.passed.length > 0 && (
            <ul aria-label="Verificaciones correctas" className="flex flex-wrap gap-2 pt-2.5">
              {pkg.passed.map((v) => (
                <li key={v.slug}><Pill tone="ok" dot={false} className="font-normal"><Check size={14} strokeWidth={2.2} aria-hidden />{CHECK_PASS_LABEL[v.key] ?? v.name}</Pill></li>
              ))}
            </ul>
          )}
        </section>

        {pkg.balance && pkg.balanceDate && (
          <section aria-labelledby="balance" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h2 id="balance" className="heading-section">Balance a {formatDate(pkg.balanceDate)}</h2>
              <span className="text-[13px] text-muted">{formatCompactEur(pkg.balance.total)}</span>
              <div className="grow" />
              <Link href={`/casos/${kase.id}/tablas`} className="inline-flex min-h-11 items-center text-[13px] font-medium">Ver tablas completas</Link>
            </div>
            <BalanceBars bars={pkg.balance} caseId={kase.id} docs={data.documents} />
          </section>
        )}

        {pkg.pnl && pkg.pnlPeriod && (
          <section aria-labelledby="pyg" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h2 id="pyg" className="heading-section">
                Cuenta de resultados{" "}
                {pkg.pnlPeriod.months === 12 && pkg.pnlPeriod.start.endsWith("-01-01")
                  ? pkg.pnlPeriod.end.slice(0, 4)
                  : `${formatDate(pkg.pnlPeriod.start)} – ${formatDate(pkg.pnlPeriod.end)}`}
              </h2>
              <span className="text-[13px] text-muted">
                {formatCompactEur(pkg.pnl.total)} de ingresos{pkg.pnlPeriod.months !== 12 ? ` · ${pkg.pnlPeriod.months} meses, sin anualizar` : ""}
              </span>
            </div>
            <BalanceBars bars={pkg.pnl} caseId={kase.id} docs={data.documents} labels={["Ingresos", "Gastos y resultado"]} />
          </section>
        )}

        <footer aria-label="Fuentes" className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
          <span>Fuentes</span>
          {pkg.sources.length === 0 && <span>Aún no hay documentos.</span>}
          {pkg.sources.map((s) => <SourcePill key={s.label} href={sourceHref(kase.id, s.docId, null)} className="font-sans text-[13px] text-ink">{s.label}</SourcePill>)}
        </footer>
      </div>

      <EvidencePanel caseId={kase.id} views={pkg.open} selected={check} canEdit={canEdit} />
    </main>
  );
}
