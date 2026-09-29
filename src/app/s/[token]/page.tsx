import type { Metadata } from "next";
import { AssistantPanel } from "@/components/borrower/AssistantPanel";
import { Checklist } from "@/components/borrower/Checklist";
import { PortalHeader } from "@/components/borrower/PortalHeader";
import { PortalMessage } from "@/components/borrower/PortalMessage";
import { SharingCard } from "@/components/borrower/SharingCard";
import { SubmitBar } from "@/components/borrower/SubmitBar";
import { productLabel } from "@/content/products.es";
import { loadAssistantView } from "@/lib/assistant/server";
import { resolveBorrowerAccess } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documentación para tu solicitud · credIA",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function requestLine(product: string | null): string {
  if (!product || product === "otro") return "Solicitud de financiación";
  const label = productLabel(product);
  return `Solicitud de ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export default async function BorrowerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const res = await resolveBorrowerAccess(db, token);

  if (!res.ok) {
    return res.reason === "expired" ? (
      <PortalMessage title="Este enlace ha caducado">
        <p>Por seguridad, los enlaces para aportar documentación caducan pasado un tiempo. Pide a la entidad que te lo envió uno nuevo; lo que ya subiste se conserva.</p>
      </PortalMessage>
    ) : (
      <PortalMessage title="No encontramos este enlace">
        <p>Comprueba que has copiado el enlace completo del correo. Si lo has recibido hace tiempo, puede que se haya sustituido por uno nuevo.</p>
      </PortalMessage>
    );
  }

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
  const isDelegate = access.actor === "delegate";
  const pct = checklist.total === 0 ? 100 : Math.round((checklist.done / checklist.total) * 100);

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader lenderName={kase.lenderName} brandColor={kase.lenderBrandColor} />

      <div className="mx-auto flex w-full max-w-[1280px] grow flex-col gap-10 px-4 py-8 sm:px-14 sm:py-10 lg:flex-row">
        <main className="flex min-w-0 grow flex-col gap-[22px]">
          <div className="flex flex-col gap-2.5">
            <div className="text-sm text-ink-2">
              {kase.companyName} · {requestLine(kase.requestedProduct)}
            </div>
            <h1 className="font-serif text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] sm:text-[38px]">Documentación para tu solicitud</h1>
            <p className="max-w-[680px] text-base leading-normal text-ink-2">
              {isDelegate
                ? `Estás aportando la documentación de ${kase.companyName} a petición de la empresa. Te explicamos cómo conseguir cada documento.`
                : `Cuanto antes esté completa, antes podrá responderte ${kase.lenderName}. Te explicamos cómo conseguir cada documento; la mayoría tarda menos de cinco minutos.`}
            </p>
          </div>

          {checklist.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface p-6 text-sm text-ink-2">
              {kase.lenderName} no ha pedido ningún documento en esta solicitud. No tienes que hacer nada más.
            </div>
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
                  <div className="h-full rounded bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <div className="shrink-0 text-sm font-semibold">
                  {checklist.done} de {checklist.total} completados
                </div>
              </div>

              <Checklist
                token={token}
                actor={access.actor}
                lenderName={kase.lenderName}
                today={portal.today}
                items={checklist.items}
                firstIncomplete={checklist.firstIncomplete}
              />

              <SubmitBar
                token={token}
                allRequiredDone={checklist.allRequiredDone}
                missingCount={checklist.missing.length}
                submittedAt={kase.submittedAt}
                submittedLabel={kase.submittedAt ? formatDate(kase.submittedAt) : null}
                lenderName={kase.lenderName}
              />
            </>
          )}
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-[18px] lg:w-[340px] lg:pt-1">
          <SharingCard token={token} lenderName={kase.lenderName} holded={portal.holded} canWithdraw={!isDelegate} />
          <AssistantPanel
            token={token}
            lenderName={kase.lenderName}
            opening={assistant.opening}
            suggestions={assistant.suggestions}
            history={assistant.history}
            steps={assistant.steps}
          />
        </aside>
      </div>
    </div>
  );
}
