import { formatFigure, type FigureUnit } from "@/lib/format";
import { cx } from "./cx";

/** Mono figure with its unit in muted at 60% size, Spanish formatting. */
export function Figure({ value, unit, decimals, className }: { value: number | null | undefined; unit: FigureUnit; decimals?: number; className?: string }) {
  const f = formatFigure(value, unit, decimals);
  return (
    <span className={cx("font-mono tracking-[-0.03em] tabular-nums", className)}>
      {f.number}
      {f.unit && <span className="ml-[0.2em] text-[0.6em] font-normal tracking-normal text-muted">{f.unit}</span>}
    </span>
  );
}
