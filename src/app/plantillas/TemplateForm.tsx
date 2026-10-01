"use client";

/** Name, description, default product and documents of a template. The dashboard is edited separately. */
import { useActionState } from "react";
import { RequirementsPicker } from "@/components/RequirementsPicker";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { PRODUCTS } from "@/content/products.es";
import { saveTemplate, type TemplateFormState } from "./actions";

export function TemplateForm({ id, initial, canEdit }: { id: string | null; initial: Record<string, string>; canEdit: boolean }) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(saveTemplate.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : state.values;
  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form action={action} className="flex flex-col gap-10" noValidate>
      {state.status === "failed" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}
      {state.status === "invalid" && <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Revisa</Pill>Revisa los campos marcados.</p>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-10">
        <section className="flex flex-col gap-5">
          <Field id="name" label="Nombre" hint="Por ejemplo: Factoring pyme, Póliza de circulante." error={errors.name}>
            <Input id="name" name="name" required defaultValue={values.name ?? ""} maxLength={80} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <Field id="description" label="Descripción (opcional)" error={errors.description}>
            <Textarea id="description" name="description" rows={2} maxLength={300} defaultValue={values.description ?? ""} />
          </Field>
          <Field id="product" label="Producto (opcional)" hint="Se preselecciona al crear el caso." error={errors.product}>
            <Select id="product" name="product" defaultValue={values.product ?? ""}>
              <option value="">Sin producto</option>
              {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
        </section>
        <RequirementsPicker values={values} error={errors.requirements} legend="Documentos que pide" />
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : id ? "Guardar cambios" : "Crear plantilla"}</Button>
          <ButtonLink href="/plantillas" variant="secondary">Cancelar</ButtonLink>
        </div>
      )}
    </form>
  );
}
