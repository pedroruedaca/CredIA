"use client";

/** Error state: one line with a high pill and a retry, never a bordered alert box. */
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

export function ErrorLine({ message, reset }: { message: string; reset?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-[15px] text-ink-2">
      <Pill tone="high">Error</Pill>
      <span>{message}</span>
      {reset && <Button variant="link" size="sm" onClick={reset}>Reintentar</Button>}
    </div>
  );
}
