"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    if (error) return setState({ kind: "error", message: "No hemos podido enviar el enlace. Revisa el correo e inténtalo de nuevo." });
    setState({ kind: "sent", email: email.trim() });
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="rounded-[10px] bg-ok-bg p-4 text-sm text-ok">
        Te hemos enviado un enlace de acceso a <b>{state.email}</b>. Ábrelo desde este mismo navegador.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Correo electrónico
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-base font-normal"
        />
      </label>
      {state.kind === "error" && <p role="alert" className="text-sm text-high">{state.message}</p>}
      <button
        type="submit"
        disabled={state.kind === "sending"}
        className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {state.kind === "sending" ? "Enviando…" : "Enviar enlace de acceso"}
      </button>
    </form>
  );
}
