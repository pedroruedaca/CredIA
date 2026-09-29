"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import type { ChecklistHolded } from "@/lib/borrower/checklist";

/** "Qué compartimos y con quién" (right column). */
export function SharingCard({ token, lenderName, holded, canWithdraw }: { token: string; lenderName: string; holded: ChecklistHolded[]; canWithdraw: boolean }) {
  return (
    <section aria-labelledby="sharing-title" className="flex flex-col gap-3 rounded-panel bg-soft px-6 py-5 text-sm leading-normal">
      <h2 id="sharing-title" className="heading-section">Qué compartimos y con quién</h2>
      <div>
        <div className="text-[13px] text-muted">Destinatario</div>
        <div>Solo {lenderName}</div>
      </div>
      <div>
        <div className="text-[13px] text-muted">Para qué</div>
        <div>Analizar esta solicitud de financiación</div>
      </div>
      <div>
        <div className="text-[13px] text-muted">Holded</div>
        <div>{holdedText(holded)}</div>
      </div>
      {canWithdraw && <WithdrawConsent token={token} lenderName={lenderName} />}
    </section>
  );
}

function holdedText(connections: ChecklistHolded[]): string {
  const synced = connections.filter((c) => c.status === "synced");
  if (synced.length === 0) return "Sin conectar.";
  if (synced.some((c) => c.mode === "refresh" && !c.revoked_at)) {
    return "Acceso de solo lectura. La clave se guarda cifrada para actualizar los datos; puedes revocarla cuando quieras.";
  }
  if (synced.some((c) => c.revoked_at)) return "Acceso revocado. Los datos ya importados se mantienen en la solicitud.";
  return "Acceso de solo lectura. La clave se usó una vez y no se ha guardado.";
}

function WithdrawConsent({ token, lenderName }: { token: string; lenderName: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/consent`, { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(json.error ?? "No hemos podido registrarlo. Inténtalo de nuevo.");
    ref.current?.close();
    router.refresh();
  }

  return (
    <>
      <Button variant="link" size="sm" onClick={() => ref.current?.showModal()} className="self-start">
        Retirar consentimiento
      </Button>
      <Modal ref={ref} title="¿Retirar tu consentimiento?">
        <div className="flex flex-col gap-4 text-[15px]">
          <ul className="list-disc space-y-1 pl-5 text-ink-2">
            <li>No se podrán subir más documentos ni importar datos de Holded en esta solicitud.</li>
            <li>Borraremos cualquier clave de Holded guardada y desactivaremos los enlaces enviados a tu gestoría.</li>
            <li>Avisaremos a {lenderName}. Sin la documentación, no podrá seguir estudiando la solicitud.</li>
            <li>Para que se eliminen los documentos ya compartidos, pídeselo directamente a {lenderName}.</li>
          </ul>
          <p className="text-ink-2">No se puede deshacer: si cambias de opinión, {lenderName} tendrá que enviarte un enlace nuevo.</p>
          {error && <p role="alert" className="flex items-center gap-2 text-ink-2"><Pill tone="high">Error</Pill>{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => ref.current?.close()}>Cancelar</Button>
            <Button onClick={confirm} disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              Retirar consentimiento
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
