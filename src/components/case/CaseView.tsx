/**
 * Lender case view (design/lender-case-view2.html): a fixed header and evidence panel (?check=<slug>), and a body of
 * modules drawn from a layout (CaseModules; DEFAULT_LAYOUT until templates are stored). Nothing here scores or
 * recommends.
 */
import Link from "next/link";
import { Eye, LayoutDashboard } from "lucide-react";
import { ExportMenu, RequestDocumentButton } from "@/components/case/CaseActions";
import { DetailsSheet } from "@/components/case/DetailsSheet";
import { EvidencePanel } from "@/components/case/EvidencePanel";
import { AnalystPendingChip, StatusChip } from "@/components/StatusChip";
import { analystPending } from "@/lib/cases/attention";
import { Pill } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { productLabel } from "@/content/products.es";
import type { CaseViewData } from "@/lib/case-view/load";
import { buildPackage } from "@/lib/case-view/package";
import { DEFAULT_LAYOUT, type Layout, type LayoutSource } from "@/lib/case-view/modules";
import { CaseModules } from "@/components/case/modules/CaseModules";
import { LayoutEditor, type SaveOption } from "@/components/case/modules/LayoutEditor";
import { caseRef, formatDate, formatFigure, relativeTime } from "@/lib/format";

export function CaseView({
  data,
  check,
  canEdit,
  userId,
  now = new Date(),
  layout = DEFAULT_LAYOUT,
  layoutInfo = null,
  editing = false,
}: {
  data: CaseViewData;
  check: string | null;
  canEdit: boolean;
  userId: string;
  now?: Date;
  layout?: Layout;
  /** Where the layout comes from and what is saved at each level (for the editor's "save for…" / "go back to…"). */
  layoutInfo?: CaseLayoutInfo | null;
  /** "Personalizar" mode: the layout editor instead of the modules. */
  editing?: boolean;
}) {
  const { kase } = data;
  const pkg = buildPackage(data);
  const amount = kase.amount ? formatFigure(kase.amount, "EUR") : null;
  const hasFinancials = pkg.basePeriod !== null;
  

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
            <AnalystPendingChip count={analystPending(data.requirements, data.documents).length} />
            <span className="grow" />
            <DetailsSheet
              company={company}
              activity={data.activity.map((a) => ({ action: a.action, actor: a.actor, at: a.at, when: relativeTime(a.at, now) }))}
              currentUserId={userId}
            />
            <Link href={`/casos/${kase.id}/vista-empresa`} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium">
              <Eye size={15} strokeWidth={1.8} aria-hidden /> Ver como la empresa
            </Link>
            {canEdit && !editing && (
              <Tooltip label="Personalizar el panel" hint="Ordena, ensancha, ajusta o quita módulos: para este caso, su plantilla o todo el equipo.">
                <Link
                  href={`/casos/${kase.id}?personalizar=1`}
                  aria-label="Personalizar el panel"
                  className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-soft-control hover:text-ink"
                >
                  <LayoutDashboard size={16} strokeWidth={1.8} aria-hidden />
                </Link>
              </Tooltip>
            )}
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
            {canEdit && <RequestDocumentButton caseId={kase.id} companyName={kase.companyName} requested={data.requirements.filter((r) => r.required && r.source !== "lender").map((r) => r.doc_kind)} />}
            <ExportMenu caseId={kase.id} />
          </div>
        </header>

        {kase.status === "processing" && (
          <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="info">Procesando</Pill> Estamos leyendo los documentos; las cifras se actualizarán al terminar.</p>
        )}

        {!hasFinancials && !editing && (
          <div className="rounded-panel bg-soft px-8 py-12 text-center">
            <h2 className="heading-section">Aún no hay contabilidad procesada</h2>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-ink-2">
              Las cifras, indicadores y verificaciones aparecerán cuando la empresa suba su sumas y saldos o conecte Holded, o cuando haya cuentas anuales.
            </p>
            <Link href={`/casos/${kase.id}/vista-empresa`} className="mt-2 inline-flex min-h-11 items-center text-[15px]">Ver qué ha subido la empresa</Link>
          </div>
        )}

        {editing ? <CaseLayoutEditor caseId={kase.id} layout={layout} info={layoutInfo} tilesWithData={pkg.tiles.map((t) => t.id)} /> : <CaseModules layout={layout} ctx={{ data, pkg, check, canEdit, hasFinancials }} />}
      </div>

      <EvidencePanel caseId={kase.id} views={pkg.open} selected={check} canEdit={canEdit} />
    </main>
  );
}

export interface CaseLayoutInfo {
  source: LayoutSource;
  template: { id: string; name: string; hasLayout: boolean } | null;
  caseHasLayout: boolean;
  teamHasLayout: boolean;
}

const SOURCE_TEXT = (info: CaseLayoutInfo) =>
  ({
    case: "Ahora ves el diseño propio de este caso.",
    template: `Ahora ves el diseño de la plantilla «${info.template?.name ?? ""}».`,
    team: "Ahora ves el diseño del equipo.",
    default: "Ahora ves el diseño original.",
  })[info.source];

/** The editor from a case: save for this case (default), its template, or the whole team; and the "go back to…" links. */
function CaseLayoutEditor({ caseId, layout, info, tilesWithData }: { caseId: string; layout: Layout; info: CaseLayoutInfo | null; tilesWithData: string[] }) {
  const i: CaseLayoutInfo = info ?? { source: "default", template: null, caseHasLayout: false, teamHasLayout: false };
  const targets: SaveOption[] = [
    { target: { kind: "case", id: caseId }, label: "Solo este caso", hint: "Los demás casos no cambian." },
    ...(i.template
      ? [{ target: { kind: "template" as const, id: i.template.id }, label: `La plantilla «${i.template.name}»`, hint: "Los casos de esta plantilla, salvo los que tengan un diseño propio." }]
      : []),
    { target: { kind: "team" }, label: "Todo el equipo", hint: "Los casos sin diseño propio ni plantilla con diseño." },
  ];
  const resets = [
    ...(i.caseHasLayout ? [{ target: { kind: "case" as const, id: caseId }, label: i.template?.hasLayout ? "Volver al diseño de la plantilla" : "Volver al diseño del equipo" }] : []),
    ...(i.teamHasLayout ? [{ target: { kind: "team" as const }, label: "Restaurar el diseño original para el equipo" }] : []),
  ];
  return (
    <LayoutEditor
      initial={layout}
      back={`/casos/${caseId}`}
      title="Personalizar el panel del caso"
      intro={`Ordena, ensancha o quita módulos. ${SOURCE_TEXT(i)}`}
      targets={targets}
      resets={resets}
      tilesWithData={tilesWithData}
    />
  );
}
