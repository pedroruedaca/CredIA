"use client";

/**
 * Name, description, default product, documents, default cost of sales and panel of a template. The panel is the team's standard one or the
 * template's own: choosing «personalizado» opens the panel designer right after saving (the first time).
 */
import Link from "next/link";
import { LayoutDashboard, LayoutTemplate } from "lucide-react";
import { useActionState, useState } from "react";
import { cx } from "@/components/ui/cx";
import { CostOfSalesTemplateField } from "@/components/CostOfSalesTemplateField";
import { RequirementsPicker } from "@/components/RequirementsPicker";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { PRODUCTS } from "@/content/products.es";
import { saveTemplate, type TemplateFormState } from "./actions";

export function TemplateForm({ id, initial, canEdit, hasOwnPanel = false }: { id: string | null; initial: Record<string, string>; canEdit: boolean; hasOwnPanel?: boolean }) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(saveTemplate.bind(null, id), { status: "idle" });
  const values = state.status === "idle" ? initial : state.values;
  const errors = state.status === "invalid" ? state.errors : {};
  const [panel, setPanel] = useState<"team" | "custom">((values.panel as "team" | "custom" | undefined) ?? (hasOwnPanel ? "custom" : "team"));
  const designNext = panel === "custom" && !hasOwnPanel;
  const submitLabel = pending ? "Guardando…" : id ? (designNext ? "Guardar y diseñar el panel" : "Guardar cambios") : designNext ? "Crear plantilla y diseñar el panel" : "Crear plantilla";
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
        <CostOfSalesTemplateField values={values} />

        <fieldset className="flex flex-col gap-3">
          <legend className="heading-section mb-1">Panel del caso</legend>
          <p className="text-[15px] text-ink-2">Lo que ve el analista cuando llegan los documentos: indicadores, cuenta de resultados, balance, alertas…</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <PanelOption
              value="team"
              checked={panel === "team"}
              onChange={setPanel}
              icon={<LayoutTemplate size={20} strokeWidth={1.8} aria-hidden />}
              title="Panel estándar"
              text="El del equipo. Si el equipo lo cambia, esta plantilla también."
            />
            <PanelOption
              value="custom"
              checked={panel === "custom"}
              onChange={setPanel}
              icon={<LayoutDashboard size={20} strokeWidth={1.8} aria-hidden />}
              title="Panel personalizado"
              text={hasOwnPanel ? "Esta plantilla ya tiene su propio panel." : "Elige, ordena y ensancha los módulos para este tipo de operación."}
            />
          </div>
          {id && hasOwnPanel && panel === "custom" && (
            <Link href={`/plantillas/${id}?panel=1`} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[15px] font-medium">
              <LayoutDashboard size={16} strokeWidth={1.8} aria-hidden /> Editar el panel
            </Link>
          )}
          {id && hasOwnPanel && panel === "team" && <p className="text-[13px] text-muted">Al guardar se descarta el panel propio de esta plantilla.</p>}
        </fieldset>
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{submitLabel}</Button>
          <ButtonLink href="/plantillas" variant="secondary">Cancelar</ButtonLink>
        </div>
      )}
    </form>
  );
}

function PanelOption({ value, checked, onChange, icon, title, text }: { value: "team" | "custom"; checked: boolean; onChange: (v: "team" | "custom") => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <label
      className={cx(
        "flex min-h-24 cursor-pointer items-start gap-3 rounded-row px-4 py-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        checked ? "bg-ink text-white" : "bg-soft text-ink hover:bg-soft-control",
      )}
    >
      <input type="radio" name="panel" value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      <span className={cx("mt-0.5 shrink-0", checked ? "text-white" : "text-accent")}>{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className={cx("text-[13px]", checked ? "text-white/75" : "text-ink-2")}>{text}</span>
      </span>
    </label>
  );
}
