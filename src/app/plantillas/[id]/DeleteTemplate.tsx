"use client";

/** Two-step delete: the first click explains what happens, the second deletes. */
import { useState, useTransition } from "react";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import { deleteTemplate } from "../actions";

export function DeleteTemplate({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking) return <Button variant="link" size="sm" onClick={() => setAsking(true)}>Eliminar plantilla</Button>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] text-ink-2">
        Los casos creados con ella conservan sus documentos y pasan a mostrar el panel del equipo (salvo los que tengan uno propio).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteTemplate(id);
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
