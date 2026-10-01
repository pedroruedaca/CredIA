/**
 * The case view's modules (see src/lib/case-view/modules.ts): one component per module, drawn in layout order by
 * CaseModules. Each module renders nothing when it has nothing to show, so it adds no gap. Nothing here scores or
 * recommends.
 */
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { AnnualAccountsSection } from "@/components/case/AnnualAccountsSection";
import { BalanceBars } from "@/components/case/BalanceBars";
import { KpiRow } from "@/components/case/KpiRow";
import { LenderDocumentsSection } from "@/components/case/LenderDocumentsSection";
import { PnlSankey } from "@/components/case/PnlSankey";
import { RegistrySection } from "@/components/case/RegistrySection";
import { SolvencySection } from "@/components/case/SolvencySection";
import { cx } from "@/components/ui/cx";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import { CHECK_PASS_LABEL, REVIEW_LABEL } from "@/content/case-view.es";
import type { CaseViewData } from "@/lib/case-view/load";
import { layoutRows, type Layout, type ModuleId } from "@/lib/case-view/modules";
import type { CasePackage } from "@/lib/case-view/package";
import { sourceHref } from "@/lib/case-view/present";
import { formatCompactEur, formatDate } from "@/lib/format";

/** Everything a module may need, computed once for the page. */
export interface ModuleContext {
  data: CaseViewData;
  pkg: CasePackage;
  check: string | null;
  canEdit: boolean;
  hasFinancials: boolean;
}

function SummaryModule({ pkg, hasFinancials }: ModuleContext) {
  if (!hasFinancials || !pkg.summary) return null;
  return (
    <p className="max-w-[720px] text-[19px] leading-normal tracking-[-0.01em] text-ink-2 sm:text-[22px]">
      {pkg.summary.map((s, i) =>
        s.emphasis === "figure" ? <b key={i} className="font-semibold text-ink">{s.text}</b> : s.emphasis === "discrepancy" ? <b key={i} className="font-semibold text-high">{s.text}</b> : <span key={i}>{s.text}</span>,
      )}
    </p>
  );
}

function KpisModule({ pkg, hasFinancials }: ModuleContext) {
  if (!hasFinancials || pkg.tiles.length === 0) return null;
  return <KpiRow tiles={pkg.tiles} />;
}

function ReviewModule({ pkg, check, hasFinancials }: ModuleContext) {
  const reviewedCount = pkg.open.filter((v) => v.review && v.review.status !== "open").length;
  return (
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
  );
}

function PnlModule({ data, pkg }: ModuleContext) {
  const kase = data.kase;
  if (!(pkg.pnl && pkg.pnlPeriod)) return null;
  return (
    <section aria-labelledby="pyg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="pyg" className="heading-section">
          Cuenta de resultados{" "}
          {pkg.pnlPeriod.months === 12 && pkg.pnlPeriod.start.endsWith("-01-01")
            ? pkg.pnlPeriod.end.slice(0, 4)
            : `${formatDate(pkg.pnlPeriod.start)} – ${formatDate(pkg.pnlPeriod.end)}`}
        </h2>
        <span className="text-[13px] text-muted">
          {formatCompactEur(pkg.pnl.revenue)} de cifra de negocios{pkg.pnlPeriod.months !== 12 ? ` · ${pkg.pnlPeriod.months} meses, sin anualizar` : ""}
        </span>
      </div>
      <PnlSankey model={pkg.pnl} caseId={kase.id} docs={data.documents} />
    </section>
  );
}

function BalanceModule({ data, pkg }: ModuleContext) {
  const kase = data.kase;
  if (!(pkg.balance && pkg.balanceDate)) return null;
  return (
    <section aria-labelledby="balance" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="balance" className="heading-section">Balance a {formatDate(pkg.balanceDate)}</h2>
        <span className="text-[13px] text-muted">{formatCompactEur(pkg.balance.total)}</span>
        <div className="grow" />
        <Link href={`/casos/${kase.id}/tablas`} className="inline-flex min-h-11 items-center text-[13px] font-medium">Ver tablas completas</Link>
      </div>
      <BalanceBars bars={pkg.balance} caseId={kase.id} docs={data.documents} />
    </section>
  );
}

function AnalystDocumentsModule({ data, canEdit }: ModuleContext) {
  return <LenderDocumentsSection caseId={data.kase.id} data={data} canEdit={canEdit} />;
}

function AnnualAccountsModule({ data, canEdit }: ModuleContext) {
  return (
    <AnnualAccountsSection
      caseId={data.kase.id}
      data={data.annualAccounts}
      source={data.requirements.find((r) => r.doc_kind === "cuentas_anuales")?.source ?? null}
      isClosedYearBasis={data.statements.closedSource === "annual_accounts"}
      canEdit={canEdit}
    />
  );
}

function SolvencyModule({ data, canEdit }: ModuleContext) {
  return (
    <SolvencySection
      caseId={data.kase.id}
      solvency={data.solvency}
      canEdit={canEdit}
      requested={data.requirements.find((r) => r.doc_kind === "solvency_report")?.source ?? null}
    />
  );
}

function RegistryModule({ data, canEdit }: ModuleContext) {
  return <RegistrySection caseId={data.kase.id} companyName={data.registeredName} registry={data.registry} canEdit={canEdit} />;
}

function SourcesModule({ data, pkg }: ModuleContext) {
  const kase = data.kase;
  return (
    <footer aria-label="Fuentes" className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
      <span>Fuentes</span>
      {pkg.sources.length === 0 && <span>Aún no hay documentos.</span>}
      {pkg.sources.map((s) => <SourcePill key={s.label} href={sourceHref(kase.id, s.docId, null)} className="font-sans text-[13px] text-ink">{s.label}</SourcePill>)}
    </footer>
  );
}

const MODULES: Record<ModuleId, (ctx: ModuleContext) => React.ReactNode> = {
  summary: SummaryModule,
  kpis: KpisModule,
  review: ReviewModule,
  pnl: PnlModule,
  balance: BalanceModule,
  analyst_documents: AnalystDocumentsModule,
  annual_accounts: AnnualAccountsModule,
  solvency: SolvencyModule,
  registry: RegistryModule,
  sources: SourcesModule,
};

/**
 * Draws the layout's modules in order. A full-width module is drawn as is (so one with nothing to show leaves no gap);
 * two half-width modules share a row from md up and stack below it.
 */
export function CaseModules({ layout, ctx }: { layout: Layout; ctx: ModuleContext }) {
  return (
    <>
      {layoutRows(layout.modules).map((row) => {
        if (row.length === 1 && row[0].width === "full") {
          const Module = MODULES[row[0].id];
          return <Module key={row[0].id} {...ctx} />;
        }
        return (
          <div key={row.map((m) => m.id).join("+")} className="grid gap-10 md:grid-cols-2">
            {row.map((m) => {
              const Module = MODULES[m.id];
              return <div key={m.id} className="min-w-0"><Module {...ctx} /></div>;
            })}
          </div>
        );
      })}
    </>
  );
}
