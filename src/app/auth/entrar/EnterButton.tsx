"use client";

/**
 * Reads the token from the fragment (never sent to the server with the page request), removes it from the address bar,
 * and spends it only when the person presses «Entrar». No token → a link to the normal login.
 */
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ENTER_COPY } from "@/content/login.es";
import { tokenFromFragment } from "@/lib/auth/login";
import { enterWithToken } from "./actions";

export function EnterButton() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = tokenFromFragment(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    setToken(t);
  }, []);

  if (token === undefined) return <div className="h-11" aria-hidden />;
  if (token === null) {
    return (
      <p className="text-[15px] text-ink-2">
        {ENTER_COPY.noToken} <Link href="/login" className="font-medium text-accent">{ENTER_COPY.toLogin}</Link>
      </p>
    );
  }
  return (
    <Button onClick={() => start(() => enterWithToken(token))} disabled={pending}>
      {pending ? ENTER_COPY.entering : ENTER_COPY.enter}
    </Button>
  );
}
