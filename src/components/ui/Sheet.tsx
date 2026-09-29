"use client";

/** Bottom sheet: rises from the bottom (max ~60% height by default); Esc or a click outside closes. */
import { X } from "lucide-react";
import { useId, useRef } from "react";
import { cx } from "./cx";
import { useDismiss } from "./useDismiss";

export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismiss(open, onClose, ref, true);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/15 animate-[fade-in_150ms_ease-out]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("flex max-h-[60vh] w-full max-w-2xl flex-col rounded-t-panel bg-surface shadow-float animate-[rise-in_200ms_ease-out]", className)}
      >
        <div className="flex items-center gap-3 px-6 pt-5">
          <div id={titleId} className="grow heading-section">{title}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft">
            <X size={18} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 grow overflow-y-auto px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}
