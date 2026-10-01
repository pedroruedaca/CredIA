"use client";

/**
 * Documents to request, as toggle pills (one per module, e.g. «Documentos fiscales» = Modelo 200 + 303), each
 * Obligatorio / Opcional / Lo subo yo, with a maximum age where it applies. Posts `req_<kind>` / `age_<kind>`
 * (parseRequirementFields). Used by the new-case form and the template form; `values` are the initial choices
 * (a template's, or what was posted before a validation error). Remount (key) to load other values.
 */
import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Pill, TogglePill } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { REQUIREMENT_MODULES, type RequirementModule } from "@/lib/cases/requirements";

type Level = "required" | "optional" | "lender" | "none";
const LEVEL_LABEL = { required: "Obligatorio", optional: "Opcional", lender: "Lo subo yo" } as const;
const LEVELS = ["required", "optional", "lender"] as const;

/**
 * Requested documents as toggle pills, one per module (a document, or several requested together such as «Documentos
 * fiscales»). Selected modules show "Obligatorio / Opcional / Lo subo yo" (the analyst uploads it from the case view and
 * the company is not asked for it) and, where it applies, a maximum age. Posts `req_<kind>` for every kind of the module and `age_<kind>`,
 * the fields the server action validates.
 */
export function RequirementsPicker({ values, error, legend = "Documentación solicitada" }: { values: Record<string, string>; error?: string; legend?: string }) {
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    // A new case starts with nothing selected; after a failed submit the lender's choices are kept.
    Object.fromEntries(REQUIREMENT_MODULES.map((m) => [m.id, (values[`req_${m.specs[0].kind}`] as Level) ?? "none"])),
  );
  const set = (id: string, level: Level) => setLevels((l) => ({ ...l, [id]: level }));
  const selected = REQUIREMENT_MODULES.filter((m) => levels[m.id] !== "none");
  // Maximum age only for single-document modules.
  const ageSpec = (m: RequirementModule) => (m.specs.length === 1 && m.specs[0].supportsMaxAge ? m.specs[0] : null);

  return (
    <fieldset className="flex flex-col gap-4" aria-describedby={error ? "requirements-error" : "requirements-hint"}>
      <legend className="heading-section mb-1">{legend}</legend>
      <p id="requirements-hint" className="text-[15px] text-ink-2">Elige qué documentos pedir. Puedes marcarlos como opcionales y fijar una antigüedad máxima. «Lo subo yo»: lo aportas tú desde el caso y no se le pide a la empresa; la empresa recibe el aviso solo con el resto.</p>
      {error && <p id="requirements-error" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Revisa</Pill>{error}</p>}
      <div className="flex flex-wrap gap-2">
        {REQUIREMENT_MODULES.map((m) => (
          <Tooltip key={m.id} label={m.label} hint={m.hint}>
            <TogglePill pressed={levels[m.id] !== "none"} onClick={() => set(m.id, levels[m.id] === "none" ? (m.specs[0].defaultRequired === false ? "optional" : "required") : "none")}>
              {m.label}
            </TogglePill>
          </Tooltip>
        ))}
      </div>
      {REQUIREMENT_MODULES.flatMap((m) => m.specs.map((spec) => <input key={spec.kind} type="hidden" name={`req_${spec.kind}`} value={levels[m.id]} />))}

      {selected.length > 0 && (
        // One grid for all rows (subgrid), so the choice pills line up on the left whether they have two or three options.
        <ul className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          {selected.map((m) => {
            const age = ageSpec(m);
            return (
            <li key={m.id} className="-mx-4 flex flex-col gap-3 rounded-row px-4 py-3 hover:bg-soft sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-center sm:gap-x-3">
              <div className="min-w-0 grow">
                <div className="text-[15px] font-medium">{m.label}</div>
                <div className="text-[13px] text-muted">{m.hint}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:contents">
              <div role="group" aria-label={`${m.label}: obligatorio, opcional o lo subo yo`} className="flex w-fit gap-1 rounded-full bg-soft-control p-1 sm:justify-self-start">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    aria-pressed={levels[m.id] === lvl}
                    onClick={() => set(m.id, lvl)}
                    className={`min-h-9 rounded-full px-3 text-[13px] font-medium transition-colors ${levels[m.id] === lvl ? "bg-surface text-ink shadow-tile" : "text-ink-2 hover:text-ink"}`}
                  >
                    {LEVEL_LABEL[lvl]}
                  </button>
                ))}
              </div>
              {age ? (
                <label className="flex w-[140px] items-center gap-2 text-[13px] text-muted">
                  <span className="whitespace-nowrap">Máx.</span>
                  <Input
                    name={`age_${age.kind}`}
                    type="number"
                    min={1}
                    max={3650}
                    defaultValue={values[`age_${age.kind}`] ?? age.defaultMaxAgeDays?.toString() ?? ""}
                    aria-label={`Antigüedad máxima de ${age.label}, en días`}
                    className="w-[72px] px-3 font-mono"
                  />
                  <span>días</span>
                </label>
              ) : (
                <span className="hidden w-[140px] sm:block" aria-hidden />
              )}
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
