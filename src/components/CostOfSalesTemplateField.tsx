"use client";

/**
 * Template form: the default cost of sales for the adjusted gross margin (none, a starting point, or a custom choice
 * of lines and 3-digit PGC groups). Posts `cos_preset` and one `cos:<selector>` per ticked option (parseCostFields).
 * Each case created from the template gets a copy; the analyst can then refine it with the case's own accounts.
 */
import { useState } from "react";
import { TogglePill } from "@/components/ui/Pill";
import {
  COST_PRESETS,
  descendants,
  PRESET_HINT,
  PRESET_LABEL,
  PRESET_SELECTORS,
  presetOf,
  templateCostOptions,
  toggleSelection,
  type CostOption,
} from "@/lib/kpis/cost-of-sales";

const OPTIONS = templateCostOptions();
const ORDER = OPTIONS.flatMap((o) => [o.option.selector, ...descendants(o.option)]);

export function CostOfSalesTemplateField({ values }: { values: Record<string, string> }) {
  const initial = Object.keys(values).filter((k) => k.startsWith("cos:")).map((k) => k.slice(4));
  const [enabled, setEnabled] = useState((values.cos_preset ?? "none") !== "none");
  const [selectors, setSelectors] = useState<string[]>(initial.length ? initial : (COST_PRESETS as readonly string[]).includes(values.cos_preset ?? "") ? PRESET_SELECTORS[values.cos_preset as keyof typeof PRESET_SELECTORS] : PRESET_SELECTORS.trading);
  const preset = presetOf(selectors);
  const toggle = (o: CostOption, on: boolean) => setSelectors((s) => toggleSelection(s, o, on, ORDER));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="heading-section mb-1">Coste de ventas</legend>
      <p className="text-[15px] text-ink-2">
        Para el margen bruto ajustado: qué costes son directos en este tipo de operación. Cada caso recibe una copia, que el analista puede afinar con las
        cuentas de la empresa. El margen bruto contable (aprovisionamientos) se muestra siempre.
      </p>
      <input type="hidden" name="cos_preset" value={enabled ? preset : "none"} />
      <div role="group" aria-label="Coste de ventas por defecto" className="flex flex-wrap gap-2">
        <TogglePill pressed={!enabled} onClick={() => setEnabled(false)}>Sin criterio</TogglePill>
        {COST_PRESETS.map((p) => (
          <TogglePill
            key={p}
            pressed={enabled && preset === p}
            onClick={() => {
              setEnabled(true);
              setSelectors(PRESET_SELECTORS[p]);
            }}
          >
            {PRESET_LABEL[p]}
          </TogglePill>
        ))}
        {enabled && preset === "custom" && <TogglePill pressed disabled>{PRESET_LABEL.custom}</TogglePill>}
      </div>
      <p className="text-[13px] text-muted">
        {!enabled ? "Los casos solo tendrán el margen contable hasta que el analista defina su coste de ventas." : preset === "custom" ? "Selección propia." : PRESET_HINT[preset]}
      </p>
      {enabled && (
        <ul aria-label="Costes directos" className="flex flex-col">
          {OPTIONS.map(({ option }) => (
            <li key={option.selector} className="border-t border-hairline py-1.5">
              <Check option={option} checked={selectors.includes(option.selector)} implied={false} onToggle={toggle} strong />
              <ul className="flex flex-wrap gap-x-5 pl-7">
                {option.children.map((c) => (
                  <li key={c.selector}>
                    <Check option={c} checked={selectors.includes(c.selector) || selectors.includes(option.selector)} implied={selectors.includes(option.selector)} onToggle={toggle} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function Check({ option: o, checked, implied, onToggle, strong }: { option: CostOption; checked: boolean; implied: boolean; onToggle: (o: CostOption, on: boolean) => void; strong?: boolean }) {
  const [code, ...name] = o.label.split(" ");
  return (
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-[13px] sm:min-h-9">
      {/* Ticked by its line: disabled, so it is not posted (the line already includes it). */}
      <input type="checkbox" name={implied ? undefined : `cos:${o.selector}`} className="size-4 accent-[#0E5A61]" checked={checked} disabled={implied} onChange={(e) => onToggle(o, e.target.checked)} />
      {strong ? <span className="text-[15px] font-medium">{o.label}</span> : <span className="text-ink-2"><span className="font-mono">{code}</span> {name.join(" ")}</span>}
    </label>
  );
}
