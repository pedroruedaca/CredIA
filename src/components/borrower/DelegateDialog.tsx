"use client";

import { Loader2, Mail } from "lucide-react";
import { useRef, useState } from "react";
import { CopyLink } from "@/components/CopyLink";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "sent"; email: string; link: string; emailSent: boolean };

/** "¿Lo gestiona tu asesoría? Enviar esta petición a mi gestoría" + modal. */
export function DelegateDialog({ link, lenderName, inline = false }: { link: string; lenderName: string; inline?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const res = await fetch(`/api/borrower/${encodeURIComponent(link)}/delegate`, {
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
      {inline ? (
        <Button variant="link" onClick={() => ref.current?.showModal()}>
          Lo tiene mi gestoría: enviarle la petición
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-2">
          <Mail size={16} strokeWidth={1.8} aria-hidden />
          <span>¿Lo gestiona tu asesoría?</span>
          <Button variant="link" size="sm" onClick={() => ref.current?.showModal()}>
            Enviar esta petición a mi gestoría
          </Button>
        </div>
      )}

      <Modal ref={ref} title="Enviar a tu gestoría" onClose={() => state.kind === "sent" && setState({ kind: "idle" })}>
        {state.kind === "sent" ? (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-ink-2">
              {state.emailSent
                ? `Hemos enviado el enlace a ${state.email}. `
                : `No hemos podido enviar el correo automáticamente: copia el enlace y envíaselo a ${state.email}. `}
              Con él podrá subir los documentos de esta solicitud, pero no enviarla a otras personas ni retirar tu consentimiento.
            </p>
            <CopyLink link={state.link} label="Enlace para tu gestoría" />
            <Button variant="secondary" onClick={close} className="self-start">Hecho</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-[15px] text-ink-2">
              Tu gestoría recibirá un enlace a esta misma lista para subir los documentos por ti. Solo {lenderName} verá lo que se suba.
            </p>
            <Field id="delegate-email" label="Correo de tu gestoría">
              <Input id="delegate-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {state.kind === "error" && <p role="alert" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
            <Button type="submit" disabled={state.kind === "sending"} className="self-start">
              {state.kind === "sending" && <Loader2 size={16} className="animate-spin" aria-hidden />}
              Enviar enlace
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
