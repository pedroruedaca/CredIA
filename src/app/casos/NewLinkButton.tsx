"use client";

/** "Nuevo enlace" on a case row: confirms, issues a fresh borrower link (the old one stops working) and shows it once. */
import { Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { CopyLink } from "@/components/CopyLink";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { regenerateBorrowerLink, type RegenerateLinkResult } from "./actions";

export function NewLinkButton({ caseId, companyName, compact = false }: { caseId: string; companyName: string; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RegenerateLinkResult | null>(null);

  const close = () => ref.current?.close();

  async function generate() {
    setBusy(true);
    try {
      setResult(await regenerateBorrowerLink(caseId));
    } catch {
      setResult({ ok: false, message: "No hemos podido generar el enlace. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => ref.current?.showModal()}
          title="Nuevo enlace"
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-soft-control hover:text-ink"
        >
          <Link2 size={18} strokeWidth={1.8} aria-hidden />
          <span className="sr-only">Nuevo enlace para {companyName}</span>
        </button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => ref.current?.showModal()}>
          <Link2 size={15} strokeWidth={1.8} aria-hidden /> Nuevo enlace
          <span className="sr-only"> para {companyName}</span>
        </Button>
      )}

      <Modal ref={ref} title={`Nuevo enlace para ${companyName}`} onClose={() => setResult(null)}>
        <div className="flex flex-col gap-4 text-[15px]">
          {result?.ok ? (
            <>
              <p className="leading-relaxed text-ink-2">
                Este es el nuevo enlace de la empresa. Caduca en {result.expiresInDays} días. Por seguridad no lo guardamos: cópialo ahora.
              </p>
              <CopyLink link={result.link} />
              <p className="flex flex-wrap items-center gap-2 text-ink-2">
                <Pill tone={result.emailSent ? "ok" : "warn"}>{result.emailSent ? "Enviado" : "Sin correo"}</Pill>
                {result.emailSent
                  ? `También se ha enviado a ${result.borrowerEmail}.`
                  : result.borrowerEmail
                    ? `No hay un servicio de correo configurado: envía tú el enlace a ${result.borrowerEmail}.`
                    : "Envía tú el enlace a la empresa."}
              </p>
              <Button variant="secondary" onClick={close} className="self-end">Cerrar</Button>
            </>
          ) : (
            <>
              <p className="leading-relaxed text-ink-2">
                Generaremos un enlace nuevo y <b className="text-ink">el anterior dejará de funcionar</b>. Lo que la empresa ya haya subido se
                conserva. Úsalo si la empresa ha perdido el enlace o crees que alguien más lo tiene.
              </p>
              {result && !result.ok && (
                <p role="alert" className="flex items-center gap-2 text-ink-2"><Pill tone="high">Error</Pill>{result.message}</p>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={close}>Cancelar</Button>
                <Button onClick={generate} disabled={busy}>{busy ? "Generando…" : "Generar nuevo enlace"}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
