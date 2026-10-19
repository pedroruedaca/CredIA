"use client";

import { useActionState, useState } from "react";
import { UNIT_TEXT } from "@/content/policies.es";
import type { ParameterUnit } from "@/lib/policies/parameters";
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
  requirements: TemplateRequirement[];
  /** The template's default credit policy, applied to the case when it is created. */
  policyName?: string | null;
  /** Per-case parameters that policy uses: required on the form. */
  requiredParameterIds?: string[];
}

/** A per-case policy parameter the form can take a value for. */
export interface CaseParameterOption {
  id: string;
  name: string;
  unit: ParameterUnit;
  description: string | null;
}

export function NewCaseForm({ templates = [], initialTemplateId = "", caseParameters = [] }: { templates?: TemplateOption[]; initialTemplateId?: string; caseParameters?: CaseParameterOption[] }) {
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

  // A template fills the documents (still editable); after a validation error, what was posted wins.
  const template = templates.find((t) => t.id === templateId) ?? null;
  const fromTemplate: Record<string, string> = template ? templateFormValues(template.requirements) : {};
  // The template's policy's per-case parameters first (required), then the rest (optional).
  const requiredIds = new Set(template?.requiredParameterIds ?? []);
  const orderedParameters = [...caseParameters].sort((a, b) => Number(requiredIds.has(b.id)) - Number(requiredIds.has(a.id)));
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
          <Field id="template_id" label="Plantilla" hint="Rellena los documentos y aplica su política; puedes cambiarlos.">
            <Select id="template_id" name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-describedby="template_id-hint">
              <option value="">Sin plantilla</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {template?.description && <p className="text-[13px] text-muted">{template.description}</p>}
          {template?.policyName && <p className="text-[13px] text-muted">Se aplicará la política «{template.policyName}»; puedes cambiarla en el caso.</p>}
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

      {orderedParameters.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="heading-section">Parámetros</h2>
            <p className="text-[15px] text-ink-2">
              {requiredIds.size
                ? `La política «${template?.policyName}» necesita los marcados como obligatorios. Los demás son opcionales; puedes añadirlos o cambiarlos después desde el caso.`
                : "Opcionales: los valores de este caso que vuestras políticas comparan con sus indicadores. Puedes añadirlos o cambiarlos después desde el caso."}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {orderedParameters.map((p) => {
              const key = `param_${p.id}` as const;
              const unit = UNIT_TEXT[p.unit];
              return (
                <Field key={`${fillKey}:${p.id}`} id={key} label={`${p.name}${unit ? ` (${unit})` : ""}${requiredIds.has(p.id) ? "" : " · opcional"}`} hint={p.description ?? undefined} error={err(key)}>
                  <Input id={key} name={key} inputMode="decimal" required={requiredIds.has(p.id)} defaultValue={v(key)} className="font-mono" {...a11y(key, !!p.description)} />
                </Field>
              );
            })}
          </div>
        </section>
      )}

      <RequirementsPicker key={fillKey} values={values} error={errors.requirements} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear caso"}</Button>
        <ButtonLink href="/casos" variant="secondary">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
