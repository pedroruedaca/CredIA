"use client";

/**
 * A policy parameter: name, description and unit. It has no value of its own: the analyst enters it on each case. The
 * unit is chosen once (policies rely on it), so it is read-only when editing.
 */
import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { PARAMETER_HINT, PARAMETER_UNIT_LABEL } from "@/content/policies.es";
import { PARAMETER_UNITS } from "@/lib/policies/parameters";
import { saveParameter, type ParameterFormState } from "./actions";

export function ParameterForm({ id, initial, canEdit }: { id: string | null; initial: Record<string, string>; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ParameterFormState, FormData>(saveParameter.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : { ...initial, ...state.values };
  const errors = state.status === "invalid" ? state.errors : {};
  const editing = id !== null;

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      {state.status === "failed" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      {state.status === "invalid" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Revisa</Pill>Revisa los campos marcados.</p>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <Field id="name" label="Nombre" hint="Por ejemplo: Importe solicitado, Plazo, Cuota mensual." error={errors.name}>
          <Input id="name" name="name" required maxLength={60} defaultValue={values.name ?? ""} aria-invalid={errors.name ? true : undefined} />
        </Field>
        <Field id="description" label="Descripción (opcional)" hint="Se muestra junto al campo al crear un caso." error={errors.description}>
          <Textarea id="description" name="description" rows={2} maxLength={300} defaultValue={values.description ?? ""} />
        </Field>
        <Field id="unit" label="Unidad" hint={editing ? "No se puede cambiar: las políticas la usan." : "La de los indicadores con los que se compara."} error={errors.unit} className="max-w-xs">
          <Select id="unit" name="unit" defaultValue={values.unit || "EUR"} disabled={editing}>
            {PARAMETER_UNITS.map((u) => <option key={u} value={u}>{PARAMETER_UNIT_LABEL[u]}</option>)}
          </Select>
        </Field>
        <p className="text-[15px] text-ink-2">{PARAMETER_HINT}</p>
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear parámetro"}</Button>
          <ButtonLink href="/politicas/parametros" variant="secondary">Cancelar</ButtonLink>
        </div>
      )}
    </form>
  );
}
