"use client";

/**
 * The analyst's cost of sales: a preset to start from, then lines, PGC groups and subaccounts (or model lines) to
 * tick, with their amounts per period and their source. Ticking a line or a group includes everything below it. The
 * preview shows the accounting and the adjusted gross margin per period as the selection changes.
 */
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { resetCostOfSales, saveCostOfSales } from "@/app/casos/cost-actions";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Figure } from "@/components/ui/Figure";
import { SourcePill, TogglePill } from "@/components/ui/Pill";
import {
  applyCostOfSales,
  COST_PRESETS,
  PRESET_HINT,
  PRESET_LABEL,
  PRESET_SELECTORS,
  presetOf,
  selectorLabel,
  toggleSelection,
  type CostOfSalesDefinition,
  type CostOption,
} from "@/lib/kpis/cost-of-sales";
import type { CanonicalStatement } from "@/lib/pgc/mapping";
import { formatEurWhole } from "@/lib/format";

export type OptionSource = { label: string; href: string | null };
type Column = { kind: "closed_fy" | "ytd"; label: string };

export function CostOfSalesEditor({
  caseId,
  canEdit,
  statements,
  options,
  order,
  columns,
  sources,
  initial,
  initialSource,
  ledgerDetail,
}: {
  caseId: string;
  canEdit: boolean;
  statements: CanonicalStatement[];
  options: { line: string; option: CostOption }[];
  order: string[];
  columns: Column[];
  sources: Record<string, OptionSource>;
  initial: CostOfSalesDefinition | null;
  initialSource: "analyst" | "template" | null;
  /** Statements come from a ledger (subaccounts can be ticked), not only from the annual-accounts model. */
  ledgerDetail: boolean;
}) {
  const router = useRouter();
  const [selectors, setSelectors] = useState<string[]>(initial?.selectors ?? PRESET_SELECTORS.trading);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const preset = presetOf(selectors);
  const dirty = !initial || JSON.stringify([...selectors].sort()) !== JSON.stringify([...initial.selectors].sort());

  const preview = useMemo(
    () =>
      statements.map((s) => {
        const r = applyCostOfSales(s, { preset, selectors });
        const rev = s.incomeStatement.revenue;
        return {
          kind: s.period.kind,
          accounting: rev > 0 ? Math.round(((rev - s.incomeStatement.cogs) / rev) * 1000) / 10 : null,
          adjusted: rev > 0 ? Math.round(((rev - r.total) / rev) * 1000) / 10 : null,
          cost: r.total,
        };
      }),
    [statements, selectors, preset],
  );

  const toggle = (o: CostOption, on: boolean) => setSelectors((s) => toggleSelection(s, o, on, order));
  // Ticked (by a starting point or a template) but with no row here: this company has no such cost.
  const notHere = selectors.filter((sel) => !order.includes(sel));
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveCostOfSales(caseId, { preset, selectors });
      if (!r.ok) return setError(r.message);
      router.push(`/casos/${caseId}`);
      router.refresh();
    });
  const reset = () =>
    start(async () => {
      setError(null);
      const r = await resetCostOfSales(caseId);
      if (!r.ok) return setError(r.message);
      router.push(`/casos/${caseId}`);
      router.refresh();
    });

  return (
    <div className="mt-8 flex flex-col gap-8">
      {initialSource === "template" && <p className="text-[13px] text-muted">Ahora se aplica el criterio de la plantilla del caso. Si lo cambias, pasa a ser el tuyo.</p>}

      <section aria-labelledby="punto-de-partida" className="flex flex-col gap-2">
        <h2 id="punto-de-partida" className="heading-section">Punto de partida</h2>
        <div role="group" aria-label="Punto de partida" className="flex flex-wrap gap-2">
          {COST_PRESETS.map((p) => (
            <TogglePill key={p} pressed={preset === p} disabled={!canEdit} onClick={() => setSelectors(PRESET_SELECTORS[p])}>{PRESET_LABEL[p]}</TogglePill>
          ))}
          {preset === "custom" && <TogglePill pressed disabled>{PRESET_LABEL.custom}</TogglePill>}
        </div>
        <p className="text-[13px] text-muted">{preset === "custom" ? "Tu selección no coincide con ningún punto de partida." : PRESET_HINT[preset]}</p>
      </section>

      <section aria-labelledby="resultado" className="flex flex-col gap-2">
        <h2 id="resultado" className="heading-section">Resultado</h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {preview.map((p) => (
            <div key={p.kind} className="flex flex-col gap-1">
              <dt className="text-[13px] text-muted">{columns.find((c) => c.kind === p.kind)?.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[13px] text-ink-2">Ajustado</span>
                  <Figure value={p.adjusted} unit="%" decimals={1} className="text-[22px] font-medium" />
                </span>
                <span className="flex items-baseline gap-1.5 text-ink-2">
                  <span className="text-[13px]">Contable</span>
                  <Figure value={p.accounting} unit="%" decimals={1} className="text-[15px]" />
                </span>
                <span className="text-[13px] text-muted">coste de ventas <span className="font-mono">{formatEurWhole(p.cost)} €</span></span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="costes" className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(var(--cols),110px)] items-baseline gap-x-4 pb-2 text-xs text-muted" style={{ "--cols": columns.length } as React.CSSProperties}>
          <h2 id="costes" className="heading-section text-ink">Costes directos</h2>
          {columns.map((c) => <span key={c.kind} className="text-right">{c.label}</span>)}
        </div>
        {!ledgerDetail && <p className="pb-2 text-[13px] text-muted">Con cuentas anuales solo se pueden marcar las líneas del modelo; con sumas y saldos u Holded, también cada cuenta.</p>}
        <ul className="flex flex-col">
          {options.map(({ option }) => (
            <OptionRow key={option.selector} option={option} depth={0} implied={false} selectors={selectors} columns={columns} sources={sources} canEdit={canEdit} onToggle={toggle} />
          ))}
        </ul>
        {notHere.length > 0 && (
          <div className="flex flex-col gap-1 pt-3">
            <span className="text-[13px] text-ink-2">También marcado, sin importe en este caso:</span>
            <ul className="flex flex-wrap gap-2">
              {notHere.map((sel) => (
                <li key={sel} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-soft px-3 text-[13px] text-ink-2">
                  <AccountLabel text={selectorLabel(sel)} />
                  {canEdit && (
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => setSelectors((s) => s.filter((x) => x !== sel))} aria-label={`Quitar ${selectorLabel(sel)}`}>
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="pt-3 text-[13px] text-muted">Lo que marques cuenta en todos los periodos. Las amortizaciones, los gastos financieros y el impuesto sobre beneficios no forman parte del coste de ventas.</p>
      </section>

      {error && <ErrorLine message={error} />}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving || !dirty || selectors.length === 0}>{saving ? "Guardando…" : "Guardar coste de ventas"}</Button>
          <ButtonLink href={`/casos/${caseId}`} variant="secondary">Cancelar</ButtonLink>
          {initial && (
            <Button variant="link" size="sm" onClick={reset} disabled={saving} className="ml-2">Quitar el criterio y dejar solo el margen contable</Button>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted">Tu rol solo permite consultar.</p>
      )}
    </div>
  );
}

function OptionRow({
  option: o,
  depth,
  implied,
  selectors,
  columns,
  sources,
  canEdit,
  onToggle,
}: {
  option: CostOption;
  depth: number;
  /** Ticked because a line or group above it is. */
  implied: boolean;
  selectors: string[];
  columns: Column[];
  sources: Record<string, OptionSource>;
  canEdit: boolean;
  onToggle: (o: CostOption, on: boolean) => void;
}) {
  const own = selectors.includes(o.selector);
  const checked = implied || own;
  const anyBelow = (x: CostOption): boolean => x.children.some((c) => selectors.includes(c.selector) || anyBelow(c));
  const partial = !checked && anyBelow(o);
  const [open, setOpen] = useState(depth === 0 || partial);
  const src = sources[o.selector];
  const grid = "grid grid-cols-[minmax(0,1fr)_repeat(var(--cols),110px)] items-center gap-x-4";
  return (
    <li className={cx(depth === 0 && "border-t border-hairline")}>
      <div className={cx(grid, "min-h-11 py-1.5", depth === 0 ? "text-[15px] font-medium" : "text-[13px] text-ink-2")} style={{ "--cols": columns.length, paddingLeft: depth * 24 } as React.CSSProperties}>
        <span className="flex min-w-0 items-center gap-2">
          {o.children.length > 0 ? (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${open ? "Plegar" : "Desplegar"} ${o.label}`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-soft hover:text-ink">
              <ChevronRight size={14} strokeWidth={2} aria-hidden className={cx("transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
            </button>
          ) : (
            <span className="size-7 shrink-0" aria-hidden />
          )}
          <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-[#0E5A61]"
              checked={checked}
              disabled={!canEdit || implied}
              ref={(el) => {
                if (el) el.indeterminate = partial;
              }}
              onChange={(e) => onToggle(o, e.target.checked)}
            />
            <span className="min-w-0"><AccountLabel text={o.label} /></span>
          </label>
          {src && <SourcePill href={src.href ?? undefined} className="min-h-6 shrink-0 px-2 text-[11px]">{src.label}</SourcePill>}
        </span>
        {columns.map((c) => (
          <span key={c.kind} className="text-right font-mono tabular-nums">{o.amounts[c.kind] === undefined ? "—" : formatEurWhole(o.amounts[c.kind])}</span>
        ))}
      </div>
      {open && o.children.length > 0 && (
        <ul>
          {o.children.map((c) => (
            <OptionRow key={c.selector} option={c} depth={depth + 1} implied={checked} selectors={selectors} columns={columns} sources={sources} canEdit={canEdit} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** "62100000 Arrendamientos": the account code in mono, its name in the text face. */
function AccountLabel({ text }: { text: string }) {
  const m = /^(\d+)(\s+.*)?$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="font-mono">{m[1]}</span>
      {m[2] ?? ""}
    </>
  );
}
