"use client";

/** Two-step delete: the first click explains what happens, the second deletes (refused while a policy uses it). */
import { useState, useTransition } from "react";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button } from "@/components/ui/Button";
import type { ParameterScope } from "@/lib/policies/parameters";
import { deleteParameter } from "../actions";

export function DeleteParameter({ id, scope }: { id: string; scope: ParameterScope }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking) return <Button variant="link" size="sm" onClick={() => setAsking(true)}>Eliminar parámetro</Button>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] text-ink-2">
        {scope === "case" ? "Se borrarán también los valores introducidos en cada caso. " : ""}Solo se puede eliminar si ninguna política lo usa.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteParameter(id);
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
