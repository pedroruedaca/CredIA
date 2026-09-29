"use client";

/** "Nuevo enlace" on a case row: confirms, issues a fresh borrower link (the old one stops working) and shows it once. */
import { Link2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { CopyLink } from "@/components/CopyLink";
import { regenerateBorrowerLink, type RegenerateLinkResult } from "./actions";

export function NewLinkButton({ caseId, companyName }: { caseId: string; companyName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RegenerateLinkResult | null>(null);

  function close() {
    ref.current?.close();
    setResult(null);
  }

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
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-surface-subtle"
      >
        <Link2 size={15} aria-hidden /> Nuevo enlace
        <span className="sr-only"> para {companyName}</span>
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setResult(null)}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 text-sm">
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="grow font-serif text-xl font-semibold">Nuevo enlace para {companyName}</h2>
            <button type="button" onClick={close} aria-label="Cerrar" className="-m-2 flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-line-row">
              <X size={18} aria-hidden />
            </button>
          </div>

          {result?.ok ? (
            <>
              <p className="leading-relaxed text-ink-2">
                Este es el nuevo enlace de la empresa. Caduca en {result.expiresInDays} días. Por seguridad no lo guardamos: cópialo ahora.
              </p>
              <CopyLink link={result.link} />
              <p className={`rounded-block p-3 ${result.emailSent ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
                {result.emailSent
                  ? `Enviado también a ${result.borrowerEmail}.`
                  : result.borrowerEmail
                    ? `No hay un servicio de correo configurado: envía tú el enlace a ${result.borrowerEmail}.`
                    : "Envía tú el enlace a la empresa."}
              </p>
              <button type="button" onClick={close} className="h-11 self-end rounded-lg border border-line-strong bg-surface px-4 font-medium">
                Cerrar
              </button>
            </>
          ) : (
            <>
              <p className="leading-relaxed text-ink-2">
                Generaremos un enlace nuevo y <b>el anterior dejará de funcionar</b>. Lo que la empresa ya haya subido se conserva. Úsalo si la
                empresa ha perdido el enlace o crees que alguien más lo tiene.
              </p>
              {result && !result.ok && <p role="alert" className="rounded-block bg-high-bg p-3 text-high">{result.message}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={close} className="h-11 rounded-lg border border-line-strong bg-surface px-4 font-medium">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="h-11 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {busy ? "Generando…" : "Generar nuevo enlace"}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
