"use client";

/** Header metrics (up to five, chosen in the «Indicadores» settings) without containers. Each opens a popover with its formula and inputs per period. */
import { Figure } from "@/components/ui/Figure";
import { Popover } from "@/components/ui/Popover";
import { VALUE_LABEL } from "@/content/case-view.es";
import { formatEvidenceValue } from "@/lib/case-view/evidence";
import { formatCompactEur } from "@/lib/format";
import type { KpiTile } from "@/lib/case-view/present";

export function KpiRow({ tiles }: { tiles: KpiTile[] }) {
  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-x-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t, i) => (
        <Popover
          key={t.id}
          align={i % 2 === 1 || i >= 3 ? "end" : "start"}
          className="w-[340px] max-w-[calc(100vw-32px)]"
          trigger={(p) => (
            <button
              type="button"
              onClick={p.toggle}
              aria-expanded={p["aria-expanded"]}
              aria-controls={p["aria-controls"]}
              className="-mx-2 flex w-full flex-col items-start gap-1.5 rounded-row px-2 py-1.5 text-left transition-colors duration-150 hover:bg-soft"
            >
              <span className="text-[13px] text-muted">{t.label}</span>
              <span className="text-[30px] font-medium leading-none">
                {t.unit === "EUR" ? (
                  // Amounts compact (110 k€, 1,0 M€) so a tile fits its column.
                  <span className="font-mono tracking-[-0.03em] tabular-nums">
                    {t.value === null ? "—" : formatCompactEur(t.value).replace(/\s(k€|M€|€)$/, "")}
                    {t.value !== null && <span className="ml-[0.2em] text-[0.6em] font-normal tracking-normal text-muted">{formatCompactEur(t.value).match(/(k€|M€|€)$/)?.[0]}</span>}
                  </span>
                ) : t.secondary === null && t.unit !== "days" ? (
                  <Figure value={t.value} unit={t.unit} decimals={t.unit === "x" ? 2 : 0} />
                ) : (
                  <span className="font-mono tracking-[-0.03em] tabular-nums">
                    {t.value ?? "—"}
                    <span className="text-lg tracking-normal text-muted">{t.secondary !== null ? `/${t.secondary}` : ""}d</span>
                  </span>
                )}
              </span>
              {t.sub && <span className="text-xs text-muted">{t.sub}</span>}
              <span className="sr-only">. Ver fórmula y datos</span>
            </button>
          )}
        >
          <div className="flex flex-col gap-4">
            {t.details.length === 0 && <p className="text-ink-2">Sin datos para calcular este indicador.</p>}
            {t.details.map(({ period, kpi }, j) => (
              <div key={j} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="grow text-[13px] font-medium">{period}</span>
                  <Figure value={kpi.value} unit={kpi.unit} decimals={kpi.unit === "x" ? 2 : undefined} className="text-[15px]" />
                </div>
                <p className="font-mono text-xs leading-relaxed text-ink-2">{kpi.formula}</p>
                {Object.keys(kpi.inputs).length > 0 && (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
                    {Object.entries(kpi.inputs).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted">{VALUE_LABEL[k] ?? k}</dt>
                        <dd className="text-right font-mono tabular-nums">{formatEvidenceValue(k, v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {kpi.note && <p className="text-xs text-muted">{kpi.note}</p>}
              </div>
            ))}
          </div>
        </Popover>
      ))}
    </section>
  );
}
