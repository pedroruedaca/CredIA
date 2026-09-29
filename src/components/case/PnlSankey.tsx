"use client";

/**
 * P&L as a Sankey (SVG): income on the left, each cost branching off, the profit flow continuing on top.
 * Nodes are buttons in the tab order; hovering or focusing one highlights its flows and shows its accounts
 * (or, for subtotals, how they are computed). Scrolls horizontally on narrow screens.
 */
import { useMemo, useState } from "react";
import type { SegmentTone } from "@/lib/case-view/balance";
import type { SourceDoc } from "@/lib/case-view/present";
import { layoutSankey, type PnlSankey as Model } from "@/lib/case-view/sankey";
import { formatCompactEur } from "@/lib/format";
import { SegmentDetail } from "./BalanceBars";

const FILL: Record<SegmentTone, string> = {
  "asset-1": "var(--color-chart-asset-1)",
  "asset-2": "var(--color-chart-asset-2)",
  "asset-3": "var(--color-chart-asset-3)",
  "debt-1": "var(--color-chart-debt-1)",
  "debt-2": "var(--color-chart-debt-2)",
  related: "var(--color-chart-related)",
  other: "var(--color-chart-other)",
};

const W = 760;
const H = 300;

export function PnlSankey({ model, caseId, docs }: { model: Model; caseId: string; docs: SourceDoc[] }) {
  const layout = useMemo(() => layoutSankey(model, { width: W, height: H, nodeWidth: 10, gap: 10, labelRight: 150, minSlot: 34 }), [model]);
  const [active, setActive] = useState<string | null>(null);
  const node = layout.nodes.find((n) => n.id === active) ?? null;
  const touches = (l: { source: string; target: string }) => !active || l.source === active || l.target === active;
  const lastCol = Math.max(...layout.nodes.map((n) => n.col));

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 overflow-x-auto px-4">
        <svg
          viewBox={`0 -6 ${W} ${layout.height + 12}`}
          className="block h-auto w-full min-w-[640px]"
          role="group"
          aria-label="Cuenta de resultados: de los ingresos al resultado"
          onMouseLeave={() => setActive(null)}
        >
          <g>
            {layout.links.map((l, i) => (
              <path
                key={i}
                d={l.path}
                fill={FILL[l.tone]}
                opacity={touches(l) ? (l.tone === "asset-3" || l.tone === "asset-2" ? 0.55 : 0.7) : 0.18}
                className="transition-opacity duration-150"
              />
            ))}
          </g>
          {layout.nodes.map((n) => {
            const label = `${n.label}: ${formatCompactEur(n.value)}`;
            const cy = n.y + Math.max(n.h, 26) / 2;
            const tx = n.x + layout.nodeWidth + 6;
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={active === n.id}
                onMouseEnter={() => setActive(n.id)}
                onFocus={() => setActive(n.id)}
                onClick={() => setActive(active === n.id ? null : n.id)}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-ink [&:focus-visible>rect]:stroke-2"
              >
                <rect x={n.x} y={n.y} width={layout.nodeWidth} height={n.h} rx={3} fill={FILL[n.tone]} stroke={active === n.id ? "var(--color-ink)" : "none"} strokeWidth={1.5} />
                <rect x={n.x - 4} y={n.y - 4} width={n.col === lastCol ? 170 : 120} height={Math.max(n.h + 8, 22)} fill="transparent" />
                <text x={tx} y={cy - 3} className="fill-ink text-[12px]" style={{ fontWeight: n.emphasis ? 600 : 400, paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: 3, strokeLinejoin: "round" }}>
                  {n.label}
                </text>
                <text x={tx} y={cy + 12} className="fill-ink-2 font-mono text-[12px]" style={{ paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: 3, strokeLinejoin: "round" }}>
                  {formatCompactEur(n.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <SegmentDetail seg={node} caseId={caseId} docs={docs} hint="Pasa el cursor o el foco por un bloque para ver sus cuentas." />
    </div>
  );
}
