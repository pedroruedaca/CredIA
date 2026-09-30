import Link from "next/link";
import { cx } from "./cx";
import { SeverityDot, type Tone } from "./SeverityDot";

const TONE: Record<Tone, string> = {
  neutral: "bg-soft-control text-ink-2",
  accent: "bg-accent-tint text-accent",
  high: "bg-high-bg text-high",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  ok: "bg-ok-bg text-ok",
};

/** Status / severity pill: tinted fill with a 6px dot. Never a coloured box. */
export function Pill({ tone = "neutral", dot = true, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium", TONE[tone], className)}>
      {dot && <SeverityDot tone={tone} />}
      {children}
    </span>
  );
}

/** Provenance pill: mono, soft. Links to the source when `href` is given. */
export function SourcePill({ href, className, children }: { href?: string; className?: string; children: React.ReactNode }) {
  const cls = cx("inline-flex min-h-7 items-center rounded-full bg-soft px-2.5 font-mono text-xs text-ink-2", href && "hover:bg-soft-control hover:text-ink hover:no-underline", className);
  if (href && /^https?:\/\//.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
  return href ? <Link href={href} className={cls}>{children}</Link> : <span className={cls}>{children}</span>;
}

/** Toggle pill (filters, bank choice…): ink when pressed. */
export function TogglePill({ pressed, className, ...rest }: { pressed: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors duration-150 ease-out sm:min-h-9",
        pressed ? "bg-ink text-white" : "bg-soft-control text-ink hover:bg-track/70",
        className,
      )}
      {...rest}
    />
  );
}
