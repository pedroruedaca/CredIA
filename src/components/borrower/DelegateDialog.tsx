"use client";

import { Loader2, Mail, X } from "lucide-react";
import { useRef, useState } from "react";
import { CopyLink } from "@/components/CopyLink";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "sent"; email: string; link: string; emailSent: boolean };

/** "¿Lo gestiona tu asesoría? Enviar esta petición a mi gestoría" + modal. */
export function DelegateDialog({ token, lenderName }: { token: string; lenderName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/delegate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ kind: "error", message: json.error ?? "No hemos podido enviar la petición. Inténtalo de nuevo." });
    setState({ kind: "sent", email, link: json.link, emailSent: json.emailSent });
  }

  function close() {
    ref.current?.close();
    if (state.kind === "sent") {
      setState({ kind: "idle" });
      setEmail("");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-2">
        <Mail size={16} aria-hidden />
        <span>¿Lo gestiona tu asesoría?</span>
        <button type="button" onClick={() => ref.current?.showModal()} className="min-h-11 text-accent underline hover:text-accent-hover">
          Enviar esta petición a mi gestoría
        </button>
      </div>

      <dialog
        ref={ref}
        aria-labelledby="delegate-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
        onClose={() => state.kind === "sent" && setState({ kind: "idle" })}
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <h2 id="delegate-title" className="grow font-serif text-[22px] font-semibold leading-tight">Enviar a tu gestoría</h2>
            <button type="button" onClick={close} aria-label="Cerrar" className="-m-2 flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-subtle">
              <X size={18} aria-hidden />
            </button>
          </div>

          {state.kind === "sent" ? (
            <>
              <p className="text-sm text-ink-2">
                {state.emailSent
                  ? `Hemos enviado el enlace a ${state.email}. `
                  : `No hemos podido enviar el correo automáticamente: copia el enlace y envíaselo a ${state.email}. `}
                Con él podrá subir los documentos de esta solicitud, pero no enviarla a otras personas ni retirar tu consentimiento.
              </p>
              <CopyLink link={state.link} label="Enlace para tu gestoría" />
              <button type="button" onClick={close} className="h-11 self-start rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-subtle">
                Hecho
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <p className="text-sm text-ink-2">
                Tu gestoría recibirá un enlace a esta misma lista para subir los documentos por ti. Solo {lenderName} verá lo que se suba.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="delegate-email" className="text-sm font-medium">Correo de tu gestoría</label>
                <input
                  id="delegate-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base"
                />
              </div>
              {state.kind === "error" && <p role="alert" className="rounded-lg bg-high-bg p-3 text-sm text-high">{state.message}</p>}
              <button
                type="submit"
                disabled={state.kind === "sending"}
                className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {state.kind === "sending" && <Loader2 size={16} className="animate-spin" aria-hidden />}
                Enviar enlace
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
