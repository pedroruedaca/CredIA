"use client";

/** Right-side floating panel (evidence): 448px, 28px radius, 24px inset, slides in. Esc closes; focus returns. */
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { cx } from "./cx";
import { useDismiss } from "./useDismiss";

export function FloatingPanel({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDismiss(open, onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, [open]);
  if (!open) return null;
  return (
    <aside
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cx(
        "fixed inset-3 z-40 flex flex-col overflow-hidden rounded-panel bg-surface shadow-float outline-none animate-[slide-in-right_200ms_ease-out] sm:inset-y-6 sm:left-auto sm:right-6 sm:w-[448px]",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-6 pt-6">
        <div id={titleId} className="min-w-0 grow">{title}</div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-soft">
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 grow overflow-y-auto px-6 pb-6 pt-4">{children}</div>
    </aside>
  );
}
