"use client";

import { useActionState, useState } from "react";
import { PRODUCTS } from "@/content/products.es";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Pill, TogglePill } from "@/components/ui/Pill";
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
            : state.emailConfigured
              ? `No se ha podido enviar el correo a ${state.borrowerEmail}: envíale tú el enlace. Si se repite, revisa la cuenta de Resend.`
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
          <Select id="product" name="product" required defaultValue={v("product", "")} {...a11y("product")}>
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

      <Requirements values={values} error={errors.requirements} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear caso"}</Button>
        <ButtonLink href="/casos" variant="secondary">Cancelar</ButtonLink>
      </div>
    </form>
  );
}

type Level = "required" | "optional" | "cif" | "none";
const LEVEL_LABEL = { required: "Obligatorio", optional: "Opcional", cif: "Por CIF" } as const;

/**
 * Requested documents as toggle pills. Selected documents show "Obligatorio / Opcional" (plus "Por CIF" for those
 * the lender can obtain without the company) and, where it applies, a maximum age. Posts the same `req_<kind>` / `age_<kind>` fields the server action already validates.
 */
function Requirements({ values, error }: { values: Record<string, string>; error?: string }) {
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    Object.fromEntries(
      REQUIREMENT_SPECS.map((spec) => {
        const def: Level = spec.defaultRequired === null ? "none" : spec.defaultRequired ? "required" : "optional";
        return [spec.kind, (values[`req_${spec.kind}`] as Level) ?? def];
      }),
    ),
  );
  const set = (kind: string, level: Level) => setLevels((l) => ({ ...l, [kind]: level }));
  const selected = REQUIREMENT_SPECS.filter((s) => levels[s.kind] !== "none");

  return (
    <fieldset className="flex flex-col gap-4" aria-describedby={error ? "requirements-error" : "requirements-hint"}>
      <legend className="heading-section mb-1">Documentación solicitada</legend>
      <p id="requirements-hint" className="text-[15px] text-ink-2">Elige qué documentos pedir. Puedes marcarlos como opcionales y fijar una antigüedad máxima. «Por CIF»: los obtienes tú con el CIF de la empresa y no se le piden.</p>
      {error && <p id="requirements-error" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Revisa</Pill>{error}</p>}
      <div className="flex flex-wrap gap-2">
        {REQUIREMENT_SPECS.map((spec) => (
          <TogglePill key={spec.kind} pressed={levels[spec.kind] !== "none"} onClick={() => set(spec.kind, levels[spec.kind] === "none" ? "required" : "none")} title={spec.hint}>
            {spec.label}
          </TogglePill>
        ))}
      </div>
      {REQUIREMENT_SPECS.map((spec) => <input key={spec.kind} type="hidden" name={`req_${spec.kind}`} value={levels[spec.kind]} />)}

      {selected.length > 0 && (
        // One grid for all rows (subgrid), so the choice pills line up on the left whether they have two or three options.
        <ul className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          {selected.map((spec) => (
            <li key={spec.kind} className="-mx-4 flex flex-col gap-3 rounded-row px-4 py-3 hover:bg-soft sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-center sm:gap-x-3">
              <div className="min-w-0 grow">
                <div className="text-[15px] font-medium">{spec.label}</div>
                <div className="text-[13px] text-muted">{spec.hint}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:contents">
              <div role="group" aria-label={`${spec.label}: ${spec.byCif ? "obligatorio, opcional o por CIF" : "obligatorio u opcional"}`} className="flex w-fit gap-1 rounded-full bg-soft-control p-1 sm:justify-self-start">
                {(spec.byCif ? (["required", "optional", "cif"] as const) : (["required", "optional"] as const)).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    aria-pressed={levels[spec.kind] === lvl}
                    onClick={() => set(spec.kind, lvl)}
                    className={`min-h-9 rounded-full px-3 text-[13px] font-medium transition-colors ${levels[spec.kind] === lvl ? "bg-surface text-ink shadow-tile" : "text-ink-2 hover:text-ink"}`}
                  >
                    {LEVEL_LABEL[lvl]}
                  </button>
                ))}
              </div>
              {spec.supportsMaxAge ? (
                <label className="flex w-[140px] items-center gap-2 text-[13px] text-muted">
                  <span className="whitespace-nowrap">Máx.</span>
                  <Input
                    name={`age_${spec.kind}`}
                    type="number"
                    min={1}
                    max={3650}
                    defaultValue={values[`age_${spec.kind}`] ?? spec.defaultMaxAgeDays?.toString() ?? ""}
                    aria-label={`Antigüedad máxima de ${spec.label}, en días`}
                    className="w-[72px] px-3 font-mono"
                  />
                  <span>días</span>
                </label>
              ) : (
                <span className="hidden w-[140px] sm:block" aria-hidden />
              )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
