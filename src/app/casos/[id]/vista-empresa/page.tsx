/**
 * "Ver como la empresa": the lender sees the borrower portal for one case, read-only, through their own session.
 * The company's magic link is neither needed nor exposed. Membership is checked with the lender's RLS client
 * before the service-role client loads the portal data; every view is audit-logged.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { BorrowerFlow } from "@/components/borrower/flow/BorrowerFlow";
import type { BorrowerAccess } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { requestLine } from "@/lib/borrower/request-line";
import { resolveStep } from "@/lib/borrower/steps";
import { formatDate } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/ui/Pill";
import { NewLinkButton } from "../../NewLinkButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vista de la empresa · credIA", robots: { index: false, follow: false } };


export default async function VistaEmpresaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const { id } = await params;
  const { paso } = await searchParams;
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
        <p role="alert" className="mt-4 flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>No hemos podido cargar la vista de la empresa. Recarga la página.</p>
      </main>
    );
  }

  const companyName = portal.kase.companyName || kase.borrower_cif;
  const linkExpired = kase.borrower_token_expires_at && new Date(kase.borrower_token_expires_at) <= new Date();

  return (
    <div className="flex grow flex-col">
      <div className="bg-accent-tint">
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-10">
          {back}
          <p className="flex grow items-center gap-2 text-sm text-ink-2">
            <Eye size={16} strokeWidth={1.8} className="shrink-0 text-accent" aria-hidden />
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
      <BorrowerFlow
        link=""
        readOnly
        actor="borrower"
        lenderName={portal.kase.lenderName}
        brandColor={portal.kase.lenderBrandColor}
        companyName={companyName}
        requestLine={requestLine(portal.kase.requestedProduct, portal.kase.requestedAmount)}
        checklist={portal.checklist}
        current={resolveStep(paso, portal.checklist.items)}
        today={portal.today}
        holded={portal.holded}
        submittedAt={portal.kase.submittedAt}
        submittedLabel={portal.kase.submittedAt ? formatDate(portal.kase.submittedAt) : null}
      />
    </div>
  );
}
