"use client";

/** Two-step delete: the first click explains what happens, the second deletes. */
import { useState, useTransition } from "react";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { deletePolicy } from "../actions";

export function DeletePolicy({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking) return <Button variant="link" size="sm" onClick={() => setAsking(true)}>Eliminar política</Button>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] text-ink-2">
        Los casos que la tenían aplicada se quedan sin política; sus indicadores no cambian.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deletePolicy(id);
              if (r && !r.ok) setError(r.message);
            })
          }
        >
          {pending ? "Eliminando…" : "Sí, eliminar"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setAsking(false)} disabled={pending}>Cancelar</Button>
      </div>
      {error && <ErrorLine message={error} />}
    </div>
  );
}
