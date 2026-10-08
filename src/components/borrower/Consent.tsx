"use client";

/** Consent withdrawal and the Holded access description, used by the borrower flow's privacy note. */

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";


export function WithdrawConsent({ link, lenderName }: { link: string; lenderName: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/borrower/${encodeURIComponent(link)}/consent`, { method: "POST" }).catch(() => null);
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
