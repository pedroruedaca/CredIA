import { cx } from "./cx";

/** Soft placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-row bg-soft", className)} />;
}
