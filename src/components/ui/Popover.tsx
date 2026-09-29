"use client";

/** Small floating layer anchored under its trigger. Esc or a click outside closes. */
import { useId, useRef, useState } from "react";
import { cx } from "./cx";
import { useDismiss } from "./useDismiss";

export function Popover({
  trigger,
  children,
  align = "start",
  className,
}: {
  trigger: (p: { open: boolean; toggle: () => void; "aria-expanded": boolean; "aria-controls": string }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(open, () => setOpen(false), ref, true);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o), "aria-expanded": open, "aria-controls": id })}
      {open && (
        <div
          id={id}
          role="dialog"
          className={cx(
            "absolute top-full z-30 mt-2 w-80 rounded-[20px] bg-surface p-4 text-sm shadow-float animate-[fade-in_150ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
