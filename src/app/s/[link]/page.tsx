import type { Metadata } from "next";
import { AssistantBar } from "@/components/borrower/AssistantBar";
import { BorrowerFlow } from "@/components/borrower/flow/BorrowerFlow";
import { PortalMessage } from "@/components/borrower/PortalMessage";
import { loadAssistantView } from "@/lib/assistant/server";
import { resolveBorrowerAccess } from "@/lib/borrower/access";
import { linkToken } from "@/lib/borrower/link-session";
import { loadPortal } from "@/lib/borrower/load";
import { resolveStep } from "@/lib/borrower/steps";
import { formatDate } from "@/lib/format";
import { requestLine } from "@/lib/borrower/request-line";
import { createAdminClient } from "@/lib/supabase/admin";
import { LINK_COPY } from "@/content/borrower-link.es";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documentación para tu solicitud · credIA",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** `/s/<handle>`: the link's token comes from its cookie (set by `/s`, see `borrowerLink`), never from the URL. */
export default async function BorrowerPortalPage({ params, searchParams }: { params: Promise<{ link: string }>; searchParams: Promise<{ paso?: string }> }) {
  const { link: handle } = await params;
  const { paso } = await searchParams;
  const token = await linkToken(handle);
  if (!token) return <LinkMessage copy={LINK_COPY.reopen} />;
  const db = createAdminClient();
  const res = await resolveBorrowerAccess(db, token);
  if (!res.ok) return <LinkMessage copy={res.reason === "expired" ? LINK_COPY.expired : LINK_COPY.invalid} />;

  const { access } = res;
  const portal = await loadPortal(db, access);
  if (!portal) {
    return (
      <PortalMessage title="No hemos podido cargar tu solicitud">
        <p>Es un problema nuestro. Recarga la página en unos minutos; tu progreso está guardado.</p>
      </PortalMessage>
    );
  }
  const { kase, checklist } = portal;

  if (access.consentWithdrawn) {
    return (
      <PortalMessage title="Has retirado tu consentimiento" lenderName={kase.lenderName}>
        <p>Ya no se pueden aportar documentos a esta solicitud y hemos avisado a {kase.lenderName}.</p>
        <p>Para que se eliminen los documentos ya compartidos, o si quieres retomar la solicitud, contacta con {kase.lenderName}.</p>
      </PortalMessage>
    );
  }

  const assistant = await loadAssistantView(db, access, portal);
  const current = resolveStep(paso, checklist.items);

  return (
    <BorrowerFlow
      link={handle}
      actor={access.actor}
      lenderName={kase.lenderName}
      brandColor={kase.lenderBrandColor}
      companyName={kase.companyName}
      requestLine={requestLine(kase.requestedProduct, kase.requestedAmount)}
      checklist={checklist}
      current={current}
      today={portal.today}
      holded={portal.holded}
      submittedAt={kase.submittedAt}
      submittedLabel={kase.submittedAt ? formatDate(kase.submittedAt) : null}
      floating={
        <AssistantBar
          link={handle}
          lenderName={kase.lenderName}
          current={current}
          opening={assistant.opening}
          history={assistant.history}
          steps={assistant.steps}
        />
      }
    />
  );
}

function LinkMessage({ copy }: { copy: { title: string; body: string } }) {
  return (
    <PortalMessage title={copy.title}>
      <p>{copy.body}</p>
    </PortalMessage>
  );
}
