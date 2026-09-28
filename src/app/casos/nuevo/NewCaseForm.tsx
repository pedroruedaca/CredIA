"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PRODUCTS } from "@/content/products.es";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { createCase, type CreateCaseState } from "./actions";
import { CopyLink } from "@/components/CopyLink";

const inputCls = "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base font-normal aria-[invalid=true]:border-high-icon";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-high">{error}</p>}
    </div>
  );
}

function lastYearEnd(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

export function NewCaseForm() {
  const [state, action, pending] = useActionState<CreateCaseState, FormData>(createCase, { status: "idle" });

  if (state.status === "created") {
    return (
      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
        <h2 className="text-[17px] font-semibold">Caso creado: {state.companyName}</h2>
        <p className="text-sm text-ink-2">
          Este es el enlace personal de la empresa para aportar la documentación. Caduca en {state.expiresInDays} días.
          Por seguridad no lo guardamos: cópialo ahora si quieres enviarlo tú.
        </p>
        <CopyLink link={state.link} />
        <p className={`rounded-[10px] p-3 text-sm ${state.emailSent ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
          {state.emailSent
            ? `Invitación enviada a ${state.borrowerEmail}.`
            : `No hay un servicio de correo configurado: envía tú el enlace a ${state.borrowerEmail}.`}
        </p>
        <div className="flex gap-4 text-sm">
          <Link href="/casos" className="font-medium">Volver a casos</Link>
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
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.status === "failed" && (
        <p role="alert" className="rounded-[10px] bg-high-bg p-3 text-sm text-high">{state.message}</p>
      )}
      {state.status === "invalid" && (
        <p role="alert" className="rounded-[10px] bg-high-bg p-3 text-sm text-high">Revisa los campos marcados.</p>
      )}

      <section className="grid gap-5 rounded-card border border-line bg-surface p-6 sm:grid-cols-2">
        <h2 className="text-[17px] font-semibold sm:col-span-2">Empresa</h2>
        <Field id="cif" label="CIF" hint="Solo personas jurídicas." error={err("cif")}>
          <input id="cif" name="cif" required defaultValue={v("cif")} autoComplete="off" className={`${inputCls} font-mono uppercase`} {...a11y("cif", true)} />
        </Field>
        <Field id="name" label="Razón social" error={err("name")}>
          <input id="name" name="name" required defaultValue={v("name")} autoComplete="organization" className={inputCls} {...a11y("name")} />
        </Field>
        <Field id="borrowerEmail" label="Correo de la persona de contacto" hint="Recibirá el enlace para aportar la documentación." error={err("borrowerEmail")}>
          <input id="borrowerEmail" name="borrowerEmail" type="email" required defaultValue={v("borrowerEmail")} className={inputCls} {...a11y("borrowerEmail", true)} />
        </Field>
        <Field id="fiscalYearEnd" label="Cierre del último ejercicio" error={err("fiscalYearEnd")}>
          <input id="fiscalYearEnd" name="fiscalYearEnd" type="date" required defaultValue={v("fiscalYearEnd", lastYearEnd())} className={inputCls} {...a11y("fiscalYearEnd")} />
        </Field>
      </section>

      <section className="grid gap-5 rounded-card border border-line bg-surface p-6 sm:grid-cols-3">
        <h2 className="text-[17px] font-semibold sm:col-span-3">Solicitud</h2>
        <Field id="product" label="Producto" error={err("product")}>
          <select id="product" name="product" required defaultValue={v("product", "")} className={inputCls} {...a11y("product")}>
            <option value="" disabled>Elige…</option>
            {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field id="amount" label="Importe (€)" error={err("amount")}>
          <input id="amount" name="amount" inputMode="decimal" required defaultValue={v("amount")} className={`${inputCls} font-mono`} {...a11y("amount")} />
        </Field>
        <Field id="termMonths" label="Plazo (meses)" error={err("termMonths")}>
          <input id="termMonths" name="termMonths" type="number" min={1} max={360} step={1} required defaultValue={v("termMonths")} className={`${inputCls} font-mono`} {...a11y("termMonths")} />
        </Field>
      </section>

      <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6" aria-describedby={errors.requirements ? "requirements-error" : undefined}>
        <legend className="sr-only">Documentación solicitada</legend>
        <h2 className="text-[17px] font-semibold" aria-hidden>Documentación solicitada</h2>
        <p className="text-sm text-ink-2">Marca qué documentos son obligatorios y, si quieres, su antigüedad máxima.</p>
        {errors.requirements && <p id="requirements-error" className="text-sm text-high">{errors.requirements}</p>}
        <div className="divide-y divide-line-row">
          {REQUIREMENT_SPECS.map((spec) => {
            const def = spec.defaultRequired === null ? "none" : spec.defaultRequired ? "required" : "optional";
            return (
              <div key={spec.kind} className="grid items-center gap-3 py-3 sm:grid-cols-[1fr_180px_170px]">
                <div>
                  <div className="text-sm font-medium" id={`req-${spec.kind}-label`}>{spec.label}</div>
                  <div className="text-xs text-muted">{spec.hint}</div>
                </div>
                <select
                  name={`req_${spec.kind}`}
                  defaultValue={v(`req_${spec.kind}`, def)}
                  aria-labelledby={`req-${spec.kind}-label`}
                  className={inputCls}
                >
                  <option value="required">Obligatorio</option>
                  <option value="optional">Opcional</option>
                  <option value="none">No solicitar</option>
                </select>
                {spec.supportsMaxAge ? (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <span className="whitespace-nowrap">Máx.</span>
                    <input
                      name={`age_${spec.kind}`}
                      type="number"
                      min={1}
                      max={3650}
                      defaultValue={v(`age_${spec.kind}`, spec.defaultMaxAgeDays?.toString() ?? "")}
                      aria-label={`Antigüedad máxima de ${spec.label}, en días`}
                      className={`${inputCls} font-mono`}
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
        <Link href="/casos" className="inline-flex h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:no-underline">
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
          {pending ? "Creando…" : "Crear caso y generar enlace"}
        </button>
      </div>
    </form>
  );
}
