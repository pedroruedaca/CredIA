"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { closeSupportRequest } from "./actions";

export function CloseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await closeSupportRequest(id);
            setError(r.ok ? null : r.message ?? "Error");
          })
        }
      >
        {pending ? "Guardando…" : "Marcar atendida"}
      </Button>
      {error && <span role="alert" className="text-[13px] text-high">{error}</span>}
    </span>
  );
}
