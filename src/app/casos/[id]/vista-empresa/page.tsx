/**
 * "Ver como la empresa": the lender sees the borrower portal for one case, read-only, through their own session.
 * The company's magic link is neither needed nor exposed. Membership is checked with the lender's RLS client
 * before the service-role client loads the portal data; every view is audit-logged.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { Checklist } from "@/components/borrower/Checklist";
import { PortalHeader } from "@/components/borrower/PortalHeader";
import { SharingCard } from "@/components/borrower/SharingCard";
import { productLabel } from "@/content/products.es";
import type { BorrowerAccess } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { formatDate } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NewLinkButton } from "../../NewLinkButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vista de la empresa · credIA", robots: { index: false, follow: false } };

function requestLine(product: string | null): string {
  if (!product || product === "otro") return "Solicitud de financiación";
  const label = productLabel(product);
  return `Solicitud de ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export default async function VistaEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lender = await requireLender();

  // RLS: only returns the case if it belongs to this lender.
  const supabase = await createClient();
  const { data: kase } = await supabase
    .from("cases")
    .select("id, lender_id, borrower_cif, borrower_token_expires_at, consent_withdrawn_at")
    .eq("id", id)
    .maybeSingle();
  if (!kase) notFound();

  const access: BorrowerAccess = {
    caseId: kase.id,
    lenderId: kase.lender_id,
    actor: "borrower",
    delegateId: null,
    delegateEmail: null,
    linkExpiresAt: kase.borrower_token_expires_at,
    consentWithdrawn: kase.consent_withdrawn_at !== null,
  };
  const portal = await loadPortal(createAdminClient(), access);

  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: kase.id,
    actor: lender.userId,
    action: "case.viewed_as_borrower",
    detail: {},
  });

  const back = (
    <Link href="/casos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">
      <ArrowLeft size={16} aria-hidden /> Volver a casos
    </Link>
  );

  if (!portal) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-10">
        {back}
        <p role="alert" className="mt-4 rounded-card bg-high-bg p-5 text-sm text-high">No hemos podido cargar la vista de la empresa. Recarga la página.</p>
      </main>
    );
  }

  const { checklist } = portal;
  const companyName = portal.kase.companyName || kase.borrower_cif;
  const pct = checklist.total === 0 ? 100 : Math.round((checklist.done / checklist.total) * 100);
  const linkExpired = kase.borrower_token_expires_at && new Date(kase.borrower_token_expires_at) <= new Date();

  return (
    <div className="flex grow flex-col">
      <div className="border-b border-line bg-accent-tint">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-14">
          {back}
          <p className="flex grow items-center gap-2 text-sm text-ink-2">
            <Eye size={16} className="shrink-0 text-accent" aria-hidden />
            <span>
              Vista de solo lectura: así ve <b className="text-ink">{companyName}</b> su página de documentación.
              {kase.consent_withdrawn_at
                ? ` Retiró su consentimiento el ${formatDate(kase.consent_withdrawn_at)}.`
                : linkExpired
                  ? " Su enlace ha caducado."
                  : ` Su enlace caduca el ${formatDate(kase.borrower_token_expires_at)}.`}
            </span>
          </p>
          {lender.role !== "viewer" && <NewLinkButton caseId={kase.id} companyName={companyName} />}
        </div>
      </div>

      <div className="flex grow flex-col" role="region" aria-label="Vista previa de la página de la empresa">
        <PortalHeader lenderName={portal.kase.lenderName} brandColor={portal.kase.lenderBrandColor} />
        <div className="mx-auto flex w-full max-w-[1280px] grow flex-col gap-10 px-4 py-8 sm:px-14 sm:py-10 lg:flex-row">
          <main className="flex min-w-0 grow flex-col gap-[22px]">
            <div className="flex flex-col gap-2.5">
              <div className="text-sm text-ink-2">
                {companyName} · {requestLine(portal.kase.requestedProduct)}
              </div>
              <h1 className="font-serif text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[38px]">Documentación para tu solicitud</h1>
            </div>

            {checklist.items.length === 0 ? (
              <div className="rounded-card border border-line bg-surface p-6 text-sm text-ink-2">No se ha pedido ningún documento en esta solicitud.</div>
            ) : (
              <>
                <div className="flex items-center gap-3.5">
                  <div
                    className="h-2 grow overflow-hidden rounded bg-line"
                    role="progressbar"
                    aria-valuenow={checklist.done}
                    aria-valuemin={0}
                    aria-valuemax={checklist.total}
                    aria-label="Documentos obligatorios completados"
                  >
                    <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="shrink-0 text-sm font-semibold">
                    {checklist.done} de {checklist.total} completados
                  </div>
                </div>
                <Checklist
                  token=""
                  actor="borrower"
                  lenderName={portal.kase.lenderName}
                  today={portal.today}
                  items={checklist.items}
                  firstIncomplete={checklist.firstIncomplete}
                  readOnly
                />
                <p className="text-[13px] text-ink-2">
                  {portal.kase.submittedAt
                    ? `La empresa envió la documentación el ${formatDate(portal.kase.submittedAt)}.`
                    : checklist.allRequiredDone
                      ? "Tiene todo lo obligatorio, pero aún no ha pulsado «Enviar documentación»."
                      : `Le faltan ${checklist.missing.length} documento${checklist.missing.length === 1 ? "" : "s"} obligatorio${checklist.missing.length === 1 ? "" : "s"}.`}
                </p>
              </>
            )}
          </main>

          <aside className="flex w-full shrink-0 flex-col gap-[18px] lg:w-[340px] lg:pt-1">
            <SharingCard token="" lenderName={portal.kase.lenderName} holded={portal.holded} canWithdraw={false} />
            <section className="rounded-card border border-dashed border-line-strong bg-surface-subtle px-[22px] py-5 text-sm text-ink-2">
              <h2 className="text-base font-semibold text-ink">Asistente de documentación</h2>
              <p className="mt-1">La empresa ve aquí el chat que le ayuda a conseguir cada documento. Sus conversaciones no se muestran en esta vista.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
