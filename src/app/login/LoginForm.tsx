"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { createClient } from "@/lib/supabase/browser";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error) return setState({ kind: "error", message: "No hemos podido enviar el enlace. Revisa el correo e inténtalo de nuevo." });
    setState({ kind: "sent", email: email.trim() });
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="flex flex-col items-start gap-2 text-[15px] text-ink-2">
        <Pill tone="ok">Enlace enviado</Pill>
        <p>Te hemos enviado un enlace de acceso a <b className="text-ink">{state.email}</b>. Ábrelo desde este mismo navegador.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Correo electrónico
        <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="font-normal" />
      </label>
      {state.kind === "error" && <p role="alert" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      <Button type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Enviando…" : "Enviar enlace de acceso"}
      </Button>
    </form>
  );
}
