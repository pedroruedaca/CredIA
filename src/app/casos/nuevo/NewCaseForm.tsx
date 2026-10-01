"use client";

import { useActionState, useState } from "react";
import { PRODUCTS } from "@/content/products.es";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { RequirementsPicker } from "@/components/RequirementsPicker";
import { templateFormValues, type TemplateRequirement } from "@/lib/cases/templates";
import { createCase, type CreateCaseState } from "./actions";
import { CopyLink } from "@/components/CopyLink";

function lastYearEnd(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

/** What the form needs of a template: its choices, not its dashboard. */
export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  product: string | null;
  requirements: TemplateRequirement[];
}

export function NewCaseForm({ templates = [], initialTemplateId = "" }: { templates?: TemplateOption[]; initialTemplateId?: string }) {
  const [state, action, pending] = useActionState<CreateCaseState, FormData>(createCase, { status: "idle" });
  const [templateId, setTemplateId] = useState(initialTemplateId);

  if (state.status === "created") {
    const actions = (
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={`/casos/${state.caseId}`}>Ir al caso</ButtonLink>
        <ButtonLink href="/casos" variant="link">Volver a casos</ButtonLink>
      </div>
    );
    if (state.companyDocuments === 0) {
      return (
        <section className="flex flex-col gap-4">
          <h2 className="heading-section">Caso creado: {state.companyName}</h2>
          <p className="flex flex-wrap items-center gap-2 text-[15px] leading-relaxed text-ink-2">
            <Pill tone="neutral">Sin invitación</Pill>
            Todos los documentos los subes tú, así que no hemos avisado a la empresa. Súbelos desde el caso. Si más adelante le pides alguno, genera un enlace con «Nuevo enlace».
          </p>
          {actions}
        </section>
      );
    }
    return (
      <section className="flex flex-col gap-4">
        <h2 className="heading-section">Caso creado: {state.companyName}</h2>
        <p className="text-[15px] leading-relaxed text-ink-2">
          Este es el enlace personal de la empresa para aportar la documentación. Caduca en {state.expiresInDays} días.
          Por seguridad no lo guardamos: cópialo ahora si quieres enviarlo tú.
        </p>
        <CopyLink link={state.link} />
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
          <Pill tone={state.emailSent ? "ok" : "warn"}>{state.emailSent ? "Invitación enviada" : "Sin correo"}</Pill>
          {state.emailSent
            ? `Enviada a ${state.borrowerEmail}, con ${state.companyDocuments === 1 ? "el documento" : `los ${state.companyDocuments} documentos`} que le toca aportar.`
            : state.emailConfigured
              ? `No se ha podido enviar el correo a ${state.borrowerEmail}: envíale tú el enlace. Si se repite, revisa la cuenta de Resend.`
              : `No hay un servicio de correo configurado: envía tú el enlace a ${state.borrowerEmail}.`}
        </p>
        {state.analystDocuments > 0 && <p className="text-[15px] text-ink-2">Los documentos que marcaste con «Lo subo yo» no se le piden: súbelos desde el caso.</p>}
        {actions}
      </section>
    );
  }

  // A template fills product and documents (still editable); after a validation error, what was posted wins.
  const template = templates.find((t) => t.id === templateId) ?? null;
  const fromTemplate: Record<string, string> = template ? { product: template.product ?? "", ...templateFormValues(template.requirements) } : {};
  const values = state.status === "idle" || state.values.template_id !== templateId ? { ...(state.status === "idle" ? {} : state.values), ...fromTemplate } : state.values;
  // Remount the fields a template fills when it changes, so they take its values.
  const fillKey = `${templateId}:${state.status}`;
  const errors = state.status === "invalid" ? state.errors : {};
  const v = (k: string, d = "") => values[k] ?? d;
  const err = (k: keyof typeof errors) => errors[k];
  const a11y = (k: keyof typeof errors, hint = false) => ({
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `${k}-error` : hint ? `${k}-hint` : undefined,
  });

  return (
    <form action={action} className="flex flex-col gap-10" noValidate>
      {state.status === "failed" && (
        <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>
      )}
      {state.status === "invalid" && (
        <p role="alert" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="high">Revisa</Pill>Revisa los campos marcados.</p>
      )}

      {templates.length > 0 && (
        <section className="flex flex-col gap-3">
          <Field id="template_id" label="Plantilla" hint="Rellena el producto y los documentos; puedes cambiarlos.">
            <Select id="template_id" name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-describedby="template_id-hint">
              <option value="">Sin plantilla</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {template?.description && <p className="text-[13px] text-muted">{template.description}</p>}
        </section>
      )}

      <section className="flex flex-col gap-5">
        <h2 className="heading-section">Empresa</h2>
        <Field id="cif" label="CIF" hint="Solo personas jurídicas." error={err("cif")}>
          <Input id="cif" name="cif" required defaultValue={v("cif")} autoComplete="off" className="font-mono uppercase" {...a11y("cif", true)} />
        </Field>
        <Field id="name" label="Razón social" error={err("name")}>
          <Input id="name" name="name" required defaultValue={v("name")} autoComplete="organization" {...a11y("name")} />
        </Field>
        <Field id="borrowerEmail" label="Correo de la persona de contacto" hint="Recibirá el enlace para aportar la documentación." error={err("borrowerEmail")}>
          <Input id="borrowerEmail" name="borrowerEmail" type="email" required defaultValue={v("borrowerEmail")} {...a11y("borrowerEmail", true)} />
        </Field>
        <Field id="fiscalYearEnd" label="Cierre del último ejercicio" error={err("fiscalYearEnd")}>
          <Input id="fiscalYearEnd" name="fiscalYearEnd" type="date" required defaultValue={v("fiscalYearEnd", lastYearEnd())} className="font-mono" {...a11y("fiscalYearEnd")} />
        </Field>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="heading-section">Solicitud</h2>
        <Field id="product" label="Producto" error={err("product")}>
          <Select key={fillKey} id="product" name="product" required defaultValue={values.product ?? ""} {...a11y("product")}>
            <option value="" disabled>Elige…</option>
            {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="amount" label="Importe (€)" error={err("amount")}>
            <Input id="amount" name="amount" inputMode="decimal" required defaultValue={v("amount")} className="font-mono" {...a11y("amount")} />
          </Field>
          <Field id="termMonths" label="Plazo (meses)" error={err("termMonths")}>
            <Input id="termMonths" name="termMonths" type="number" min={1} max={360} step={1} required defaultValue={v("termMonths")} className="font-mono" {...a11y("termMonths")} />
          </Field>
        </div>
      </section>

      <RequirementsPicker key={fillKey} values={values} error={errors.requirements} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear caso"}</Button>
        <ButtonLink href="/casos" variant="secondary">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
