"use client";

/** Re-renders the page every few seconds while something is being processed, for up to 10 minutes. */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ active, everyMs = 8000, forMs = 10 * 60 * 1000 }: { active: boolean; everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > forMs || document.hidden) return;
      router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, forMs, router]);
  return null;
}
