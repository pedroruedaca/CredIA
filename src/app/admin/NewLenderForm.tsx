"use client";

/** «Nueva entidad»: name and first owner's email. Clears itself after creating one. */
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { createLender, type NewLenderState } from "./actions";

export function NewLenderForm() {
  const [state, action, pending] = useActionState<NewLenderState, FormData>(createLender, { status: "idle" });
  const values = state.status === "invalid" || state.status === "failed" ? state.values : {};
  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form key={state.status === "created" ? state.message : "form"} action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "created" && <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="ok">Creada</Pill>{state.message}</p>}
      {state.status === "failed" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      <Field id="name" label="Nombre de la entidad" error={errors.name}>
        <Input id="name" name="name" required maxLength={120} defaultValue={values.name ?? ""} aria-invalid={errors.name ? true : undefined} />
      </Field>
      <Field id="ownerEmail" label="Correo de la persona administradora" hint="Será owner de la entidad: podrá invitar a su equipo desde «Ajustes». Si no tiene cuenta, se crea." error={errors.ownerEmail}>
        <Input id="ownerEmail" name="ownerEmail" type="email" required autoComplete="off" defaultValue={values.ownerEmail ?? ""} aria-invalid={errors.ownerEmail ? true : undefined} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear entidad e invitar"}</Button>
      </div>
    </form>
  );
}
