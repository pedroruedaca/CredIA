"use client";

/**
 * Lender sign-in: Google / Microsoft when enabled, else (or also) an email with a link and a code. The code is typed
 * here and works from any device; the link only in this browser (PKCE). Errors say what happened and what to do.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { CODE_ERROR, LINK_ERROR, LOGIN_COPY as T, PROVIDER_LABEL, SEND_ERROR } from "@/content/login.es";
import { cleanCode, codeError, RESEND_AFTER_S, sendError, type LinkError, type OAuthProvider } from "@/lib/auth/login";
import { createClient } from "@/lib/supabase/browser";

type State =
  | { kind: "idle"; error?: string }
  | { kind: "sending" }
  | { kind: "sent"; email: string; at: number; error?: string; resent?: boolean };

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

/** `problem`: why the last link or provider sign-in failed (from `?error=`), shown until a new email is asked for. */
export function LoginForm({ next, providers = [], problem = null }: { next: string; providers?: OAuthProvider[]; problem?: LinkError | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [oauth, setOauth] = useState<OAuthProvider | null>(null);

  // Ticks while the resend countdown runs.
  const waitS = state.kind === "sent" ? Math.max(0, RESEND_AFTER_S - Math.floor((now - state.at) / 1000)) : 0;
  useEffect(() => {
    if (waitS <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [waitS, now]);

  async function send(to: string, resend = false) {
    if (!resend) setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({ email: to, options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: false } });
    if (error) {
      const message = SEND_ERROR[sendError(error)];
      return setState(resend && state.kind === "sent" ? { ...state, error: message } : { kind: "idle", error: message });
    }
    setNow(Date.now());
    setCode("");
    setState({ kind: "sent", email: to, at: Date.now(), resent: resend });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "sent") return;
    const c = cleanCode(code);
    if (!c.complete) return setState({ ...state, error: CODE_ERROR.wrong_or_expired });
    setVerifying(true);
    const { error } = await createClient().auth.verifyOtp({ email: state.email, token: c.code, type: "email" });
    if (error) {
      setVerifying(false);
      return setState({ ...state, error: CODE_ERROR[codeError(error)] });
    }
    router.replace(next);
    router.refresh();
  }

  async function withProvider(p: OAuthProvider) {
    setOauth(p);
    const { error } = await createClient().auth.signInWithOAuth({ provider: p, options: { redirectTo: callbackUrl(next), ...(p === "azure" ? { scopes: "email" } : {}) } });
    if (error) {
      setOauth(null);
      setState({ kind: "idle", error: SEND_ERROR.unavailable });
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" className="flex flex-col items-start gap-2 text-[15px] text-ink-2">
          <Pill tone="ok">{state.resent ? "Correo reenviado" : T.sentTitle}</Pill>
          <p>{T.sentBody(state.email)}</p>
          <p>{T.sentHow}</p>
        </div>
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {T.code}
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value).code)}
              placeholder="123456"
              className="font-mono text-[19px] tracking-[0.2em]"
              aria-invalid={state.error ? true : undefined}
              autoFocus
            />
          </label>
          {state.error && <p role="alert" className="flex items-start gap-2 text-sm text-ink-2"><Pill tone="high" className="shrink-0">Error</Pill><span className="pt-1">{state.error}</span></p>}
          <Button type="submit" disabled={verifying || !cleanCode(code).complete}>{verifying ? T.entering : T.enter}</Button>
        </form>
        <div className="flex flex-col items-start gap-1 text-[13px] text-muted">
          {waitS > 0 ? (
            <span className="inline-flex min-h-11 items-center">{T.resendIn(waitS)}</span>
          ) : (
            <Button variant="link" size="sm" onClick={() => send(state.email, true)}>{T.resend}</Button>
          )}
          <Button variant="link" size="sm" onClick={() => setState({ kind: "idle" })}>{T.otherEmail}</Button>
          <span>{T.newerWins}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {problem && !(state.kind === "idle" && state.error) && (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink-2">
          <Pill tone="high" className="shrink-0">{LINK_ERROR[problem].pill}</Pill>
          <span className="pt-1">{LINK_ERROR[problem].text}</span>
        </p>
      )}
      {providers.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <Button key={p} variant="secondary" onClick={() => withProvider(p)} disabled={oauth !== null}>
                {oauth === p ? "Redirigiendo…" : PROVIDER_LABEL[p]}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden>
            <span className="h-px grow bg-hairline" />
            {T.orEmail}
            <span className="h-px grow bg-hairline" />
          </div>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(email.trim().toLowerCase());
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {T.email}
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="font-normal" />
        </label>
        {state.kind === "idle" && state.error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-ink-2"><Pill tone="high" className="shrink-0">Error</Pill><span className="pt-1">{state.error}</span></p>
        )}
        <Button type="submit" disabled={state.kind === "sending"}>{state.kind === "sending" ? T.sending : T.send}</Button>
      </form>
    </div>
  );
}
