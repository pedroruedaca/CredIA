"use client";

/**
 * Two stacked proportional bars (balance: assets vs equity + liabilities; P&L: income vs expenses + result). Hovering or focusing a segment shows the accounts behind it
 * inline, each with its source (lineage). Segments are buttons in the tab order; arrow keys move between them.
 */
import { useRef, useState } from "react";
import { SourcePill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { describeSource, formatAccount, sourceHref, type SourceDoc } from "@/lib/case-view/present";
import type { BalanceBars as Bars, BalanceSegment, SegmentTone } from "@/lib/case-view/balance";
import { formatCompactEur } from "@/lib/format";

const TONE: Record<SegmentTone, string> = {
  "asset-1": "bg-chart-asset-1",
  "asset-2": "bg-chart-asset-2",
  "asset-3": "bg-chart-asset-3",
  "debt-1": "bg-chart-debt-1",
  "debt-2": "bg-chart-debt-2",
  related: "bg-chart-related",
  other: "bg-chart-other",
};

const k = (n: number) => Math.round(n / 1000).toLocaleString("es-ES");

function Bar({ label, segments, active, onActive }: { label: string; segments: BalanceSegment[]; active: string | null; onActive: (id: string | null) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number, d: number) => refs.current[(i + d + segments.length) % segments.length]?.focus();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs text-muted">{label}</div>
      <div role="group" aria-label={label} className="flex h-10 gap-[3px]">
        {segments.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-label={`${s.label}: ${formatCompactEur(s.value)} (${s.pct.toLocaleString("es-ES")} %)`}
            aria-pressed={active === s.id}
            onMouseEnter={() => onActive(s.id)}
            onFocus={() => onActive(s.id)}
            onClick={() => onActive(active === s.id ? null : s.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i, 1);
              if (e.key === "ArrowLeft") move(i, -1);
            }}
            style={{ width: `${s.pct}%` }}
            className={cx(
              "min-w-1 rounded-[4px] transition-[outline] duration-100 first:rounded-l-[10px] last:rounded-r-[10px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
              TONE[s.tone],
              active === s.id && "outline-2 outline-offset-1 outline-ink",
            )}
          />
        ))}
      </div>
      <div className="flex gap-[3px] text-xs text-ink-2" aria-hidden>
        {segments.map((s) => (
          <span key={s.id} style={{ width: `${s.pct}%` }} className={cx("min-w-0 truncate", active === s.id && "font-medium text-ink")}>
            {s.pct >= 6 ? `${s.pct >= 14 ? s.label : s.short} ${k(s.value)}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BalanceBars({
  bars,
  caseId,
  docs,
  labels = ["Activo", "Patrimonio neto y pasivo"],
}: {
  bars: Bars;
  caseId: string;
  docs: SourceDoc[];
  labels?: [string, string];
}) {
  const [active, setActive] = useState<string | null>(null);
  const seg = [...bars.top, ...bars.bottom].find((s) => s.id === active) ?? null;
  const shown = seg?.accounts.slice(0, 6) ?? [];
  const rest = (seg?.accounts.length ?? 0) - shown.length;

  return (
    <div className="flex flex-col gap-4">
      <Bar label={labels[0]} segments={bars.top} active={active} onActive={setActive} />
      <Bar label={labels[1]} segments={bars.bottom} active={active} onActive={setActive} />
      <div aria-live="polite" className="min-h-[52px] rounded-[14px] bg-soft px-3.5 py-3 text-[13px] text-ink-2">
        {seg ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-ink">{seg.label} {formatCompactEur(seg.value)}</span>
            {shown.length > 0 && <span>=</span>}
            {shown.map((a, i) => {
              const src = describeSource(a.sourceRef, docs);
              return (
                <span key={`${a.account}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="mr-1">{a.amount < 0 ? "−" : "+"}</span>}
                  <span className="font-mono">{formatAccount(a.account)}</span>
                  <span>{formatCompactEur(i > 0 ? Math.abs(a.amount) : a.amount)}</span>
                  <SourcePill href={sourceHref(caseId, src.docId, src.page)} className="min-h-6 px-2 text-[11px]">{src.label}</SourcePill>
                </span>
              );
            })}
            {rest > 0 && <span>+ {rest} cuentas más</span>}
            {seg.accounts.length === 0 && (
              <span>{seg.id === "result" || seg.id === "loss" ? "= ingresos − gastos del periodo" : "Sin cuentas en este tramo."}</span>
            )}
          </div>
        ) : (
          <span>Pasa el cursor o el foco por un tramo para ver sus cuentas.</span>
        )}
      </div>
      {bars.notDrawn.length > 0 && (
        <p className="text-xs text-muted">
          No se dibujan por ser negativos: {bars.notDrawn.map((s) => `${s.label} ${formatCompactEur(s.value)}`).join(" · ")}.
        </p>
      )}
    </div>
  );
}
