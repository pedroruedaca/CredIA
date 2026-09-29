"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ChecklistHolded } from "@/lib/borrower/checklist";

/** "Qué compartimos y con quién" (right column). */
export function SharingCard({ token, lenderName, holded, canWithdraw }: { token: string; lenderName: string; holded: ChecklistHolded[]; canWithdraw: boolean }) {
  return (
    <section aria-labelledby="sharing-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface px-[22px] py-5 text-sm leading-normal">
      <h2 id="sharing-title" className="text-base font-semibold">Qué compartimos y con quién</h2>
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
      <button type="button" onClick={() => ref.current?.showModal()} className="min-h-11 self-start text-[13px] text-accent underline hover:text-accent-hover">
        Retirar consentimiento
      </button>
      <dialog
        ref={ref}
        aria-labelledby="withdraw-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 text-sm">
          <div className="flex items-start gap-3">
            <h2 id="withdraw-title" className="grow font-serif text-[22px] font-semibold leading-tight">¿Retirar tu consentimiento?</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Cerrar" className="-m-2 flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-subtle">
              <X size={18} aria-hidden />
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-ink-2">
            <li>No se podrán subir más documentos ni importar datos de Holded en esta solicitud.</li>
            <li>Borraremos cualquier clave de Holded guardada y desactivaremos los enlaces enviados a tu gestoría.</li>
            <li>Avisaremos a {lenderName}. Sin la documentación, no podrá seguir estudiando la solicitud.</li>
            <li>Para que se eliminen los documentos ya compartidos, pídeselo directamente a {lenderName}.</li>
          </ul>
          <p className="text-ink-2">No se puede deshacer: si cambias de opinión, {lenderName} tendrá que enviarte un enlace nuevo.</p>
          {error && <p role="alert" className="rounded-lg bg-high-bg p-3 text-high">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-high-icon px-4 font-semibold text-white hover:bg-high disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              Retirar consentimiento
            </button>
            <button type="button" onClick={() => ref.current?.close()} className="h-11 rounded-lg border border-line-strong px-4 font-medium hover:bg-surface-subtle">
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
