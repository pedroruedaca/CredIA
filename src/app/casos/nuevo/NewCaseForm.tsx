"use client";

import { useActionState } from "react";
import { PRODUCTS } from "@/content/products.es";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { createCase, type CreateCaseState } from "./actions";
import { CopyLink } from "@/components/CopyLink";

function lastYearEnd(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

export function NewCaseForm() {
  const [state, action, pending] = useActionState<CreateCaseState, FormData>(createCase, { status: "idle" });

  if (state.status === "created") {
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
            ? `Enviada a ${state.borrowerEmail}.`
            : `No hay un servicio de correo configurado: envía tú el enlace a ${state.borrowerEmail}.`}
        </p>
        <div>
          <ButtonLink href="/casos" variant="link">Volver a casos</ButtonLink>
        </div>
      </section>
    );
  }

  const values = state.status === "idle" ? {} : state.values;
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

      <section className="grid gap-5 sm:grid-cols-2">
        <h2 className="heading-section sm:col-span-2">Empresa</h2>
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
          <Input id="fiscalYearEnd" name="fiscalYearEnd" type="date" required defaultValue={v("fiscalYearEnd", lastYearEnd())} {...a11y("fiscalYearEnd")} />
        </Field>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        <h2 className="heading-section sm:col-span-3">Solicitud</h2>
        <Field id="product" label="Producto" error={err("product")}>
          <Select id="product" name="product" required defaultValue={v("product", "")} {...a11y("product")}>
            <option value="" disabled>Elige…</option>
            {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field id="amount" label="Importe (€)" error={err("amount")}>
          <Input id="amount" name="amount" inputMode="decimal" required defaultValue={v("amount")} className="font-mono" {...a11y("amount")} />
        </Field>
        <Field id="termMonths" label="Plazo (meses)" error={err("termMonths")}>
          <Input id="termMonths" name="termMonths" type="number" min={1} max={360} step={1} required defaultValue={v("termMonths")} className="font-mono" {...a11y("termMonths")} />
        </Field>
      </section>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.requirements ? "requirements-error" : undefined}>
        <legend className="sr-only">Documentación solicitada</legend>
        <h2 className="heading-section" aria-hidden>Documentación solicitada</h2>
        <p className="text-[15px] text-ink-2">Marca qué documentos son obligatorios y, si quieres, su antigüedad máxima.</p>
        {errors.requirements && <p id="requirements-error" className="text-sm text-high">{errors.requirements}</p>}
        <div className="divide-y divide-hairline">
          {REQUIREMENT_SPECS.map((spec) => {
            const def = spec.defaultRequired === null ? "none" : spec.defaultRequired ? "required" : "optional";
            return (
              <div key={spec.kind} className="grid items-center gap-3 py-3 sm:grid-cols-[1fr_180px_170px]">
                <div>
                  <div className="text-sm font-medium" id={`req-${spec.kind}-label`}>{spec.label}</div>
                  <div className="text-[13px] text-muted">{spec.hint}</div>
                </div>
                <Select
                  name={`req_${spec.kind}`}
                  defaultValue={v(`req_${spec.kind}`, def)}
                  aria-labelledby={`req-${spec.kind}-label`}
                 
                >
                  <option value="required">Obligatorio</option>
                  <option value="optional">Opcional</option>
                  <option value="none">No solicitar</option>
                </Select>
                {spec.supportsMaxAge ? (
                  <label className="flex items-center gap-2 text-[13px] text-muted">
                    <span className="whitespace-nowrap">Máx.</span>
                    <Input
                      name={`age_${spec.kind}`}
                      type="number"
                      min={1}
                      max={3650}
                      defaultValue={v(`age_${spec.kind}`, spec.defaultMaxAgeDays?.toString() ?? "")}
                      aria-label={`Antigüedad máxima de ${spec.label}, en días`}
                      className="font-mono"
                    />
                    <span>días</span>
                  </label>
                ) : <span />}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <ButtonLink href="/casos" variant="secondary">Cancelar</ButtonLink>
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear caso y generar enlace"}</Button>
      </div>
    </form>
  );
}
