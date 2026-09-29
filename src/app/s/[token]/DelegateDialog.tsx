"use client";

/** "Enviar esta petición a mi gestoría": creates a separate link for the gestoría, scoped to this case. */
import { Mail, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { CopyLink } from "@/components/CopyLink";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done"; email: string; sent: boolean; link: string };

export function DelegateDialog({ token, lenderName }: { token: string; lenderName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const emailId = useId();
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/delegate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setState({ kind: "error", message: json.error ?? "No se pudo enviar." });
    setState({ kind: "done", email: json.email, sent: json.sent, link: json.link });
  }

  function close() {
    ref.current?.close();
    setState({ kind: "idle" });
    setEmail("");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
        <Mail size={16} aria-hidden />
        <span>¿Lo gestiona tu asesoría?</span>
        <button type="button" onClick={() => ref.current?.showModal()} className="min-h-11 text-accent underline hover:text-accent-hover">
          Enviar esta petición a mi gestoría
        </button>
      </div>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setState({ kind: "idle" })}
        className="m-auto w-[min(480px,calc(100vw-32px))] rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="grow font-serif text-xl font-semibold">Enviar a mi gestoría</h2>
            <button type="button" onClick={close} aria-label="Cerrar" className="-m-2 flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-line-row">
              <X size={18} aria-hidden />
            </button>
          </div>

          {state.kind === "done" ? (
            <>
              <p className="text-sm leading-relaxed text-ink-2">
                {state.sent
                  ? `Hemos enviado a ${state.email} un enlace propio para aportar la documentación de esta solicitud. También puedes copiarlo:`
                  : `Copia este enlace y envíaselo a ${state.email}. Le da acceso solo a esta solicitud.`}
              </p>
              <CopyLink link={state.link} label="Enlace para la gestoría" />
              <p className="text-xs text-muted">Verás aquí lo que suba. No puede retirar tu consentimiento ni reenviar la petición.</p>
              <button type="button" onClick={close} className="h-11 self-end rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium">
                Cerrar
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-ink-2">
                Tu gestoría recibirá un enlace propio para subir la documentación que pide {lenderName}. Solo tendrá acceso a esta solicitud.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={emailId} className="text-sm font-medium">Correo de la gestoría</label>
                <input
                  id={emailId}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base"
                />
              </div>
              {state.kind === "error" && <p role="alert" className="rounded-block bg-high-bg p-3 text-sm text-high">{state.message}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={close} className="h-11 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={!email || state.kind === "sending"} className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
                  {state.kind === "sending" ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
