import { cx } from "./cx";

export type Tone = "neutral" | "accent" | "high" | "warn" | "info" | "ok";

const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  high: "bg-high-dot",
  warn: "bg-warn-dot",
  info: "bg-info-dot",
  ok: "bg-ok-dot",
};

/** 6px status dot. Decorative: the text next to it carries the meaning. */
export function SeverityDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", DOT[tone], className)} />;
}
