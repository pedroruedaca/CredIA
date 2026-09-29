import { cx } from "./ui/cx";

/** Wordmark: "cred" in ink, "IA" in accent. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cx("text-[22px] font-semibold tracking-[-0.04em] text-ink", className)}>
      cred<span className="text-accent">IA</span>
    </span>
  );
}
