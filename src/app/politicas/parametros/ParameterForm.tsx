"use client";

/**
 * A policy parameter: name, description, unit, fixed or per case and, when fixed, its value. Unit and scope are chosen
 * once (policies rely on the unit), so they are read-only when editing.
 */
import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { PARAMETER_SCOPE_HINT, PARAMETER_UNIT_LABEL, UNIT_TEXT } from "@/content/policies.es";
import { PARAMETER_UNITS, type ParameterScope, type ParameterUnit } from "@/lib/policies/parameters";
import { saveParameter, type ParameterFormState } from "./actions";

export function ParameterForm({ id, initial, canEdit }: { id: string | null; initial: Record<string, string>; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ParameterFormState, FormData>(saveParameter.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : { ...initial, ...state.values };
  const errors = state.status === "invalid" ? state.errors : {};
  const [scope, setScope] = useState<ParameterScope>((values.scope as ParameterScope) || "fixed");
  const [unit, setUnit] = useState<ParameterUnit>((values.unit as ParameterUnit) || "EUR");
  const editing = id !== null;

  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      {state.status === "failed" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      {state.status === "invalid" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Revisa</Pill>Revisa los campos marcados.</p>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <Field id="name" label="Nombre" hint="Por ejemplo: Importe solicitado, DSCR mínimo, Plazo." error={errors.name}>
          <Input id="name" name="name" required maxLength={60} defaultValue={values.name ?? ""} aria-invalid={errors.name ? true : undefined} />
        </Field>
        <Field id="description" label="Descripción (opcional)" error={errors.description}>
          <Textarea id="description" name="description" rows={2} maxLength={300} defaultValue={values.description ?? ""} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="unit" label="Unidad" hint={editing ? "No se puede cambiar: las políticas la usan." : "La de los indicadores con los que se compara."} error={errors.unit}>
            <Select id="unit" name="unit" value={unit} disabled={editing} onChange={(e) => setUnit(e.target.value as ParameterUnit)}>
              {PARAMETER_UNITS.map((u) => <option key={u} value={u}>{PARAMETER_UNIT_LABEL[u]}</option>)}
            </Select>
          </Field>
          <Field id="scope" label="Valor" hint={editing ? "No se puede cambiar." : PARAMETER_SCOPE_HINT[scope]} error={errors.scope}>
            <Select id="scope" name="scope" value={scope} disabled={editing} onChange={(e) => setScope(e.target.value as ParameterScope)}>
              <option value="fixed">Fijo para todos los casos</option>
              <option value="case">Se introduce en cada caso</option>
            </Select>
          </Field>
        </div>
        {scope === "fixed" ? (
          <Field id="value" label={`Valor${UNIT_TEXT[unit] ? ` (${UNIT_TEXT[unit]})` : ""}`} hint="Cambiarlo cambia el umbral en todos los casos con políticas que lo usan." error={errors.value}>
            <Input id="value" name="value" inputMode="decimal" defaultValue={values.value ?? ""} className="w-48! font-mono tabular-nums" aria-invalid={errors.value ? true : undefined} />
          </Field>
        ) : (
          editing && <p className="text-[15px] text-ink-2">{PARAMETER_SCOPE_HINT.case}</p>
        )}
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
