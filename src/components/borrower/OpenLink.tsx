"use client";

import { useEffect, useState } from "react";
import { PortalMessage } from "@/components/borrower/PortalMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { LINK_COPY } from "@/content/borrower-link.es";

type Outcome = "opening" | "invalid" | "expired" | "reopen" | "failed";

/**
 * Reads the token from the URL fragment, drops it from the address bar and history at once, swaps it for the link's
 * cookies (`POST /api/borrower/session`) and replaces this page with `/s/<handle>`, keeping `?paso=`.
 */
export function OpenLink() {
  const [outcome, setOutcome] = useState<Outcome>("opening");

  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.slice(1));
    const search = window.location.search;
    window.history.replaceState(null, "", `/s${search}`);
    if (!token) {
      setOutcome("reopen");
      return;
    }
    (async () => {
      const res = await fetch("/api/borrower/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { handle?: string; error?: string } | null;
      if (res?.ok && body?.handle) window.location.replace(`/s/${body.handle}${search}`);
      else if (res?.status === 404) setOutcome(body?.error === "expired" ? "expired" : "invalid");
      else setOutcome("failed");
    })();
  }, []);

  if (outcome === "opening") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-10" aria-busy="true" aria-label={LINK_COPY.opening}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-44 rounded-[24px]" />
      </main>
    );
  }
  const copy = LINK_COPY[outcome];
  return (
    <PortalMessage title={copy.title}>
      <p>{copy.body}</p>
    </PortalMessage>
  );
}
