"use client";

/** Centred modal on a native <dialog> (focus trap and Esc for free). Elevated, 28px radius, no border. */
import { X } from "lucide-react";
import { forwardRef, useId } from "react";
import { cx } from "./cx";

export const Modal = forwardRef<HTMLDialogElement, { title: React.ReactNode; onClose?: () => void; children: React.ReactNode; className?: string }>(function Modal(
  { title, onClose, children, className },
  ref,
) {
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={cx("m-auto w-[min(520px,calc(100vw-32px))] rounded-panel bg-surface p-0 text-ink shadow-float backdrop:bg-ink/25", className)}
    >
      <div className="flex flex-col gap-4 p-7">
        <div className="flex items-start gap-3">
          <h2 id={titleId} className="grow text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
          <button
            type="button"
            onClick={() => (ref as React.RefObject<HTMLDialogElement | null>)?.current?.close()}
            aria-label="Cerrar"
            className="-m-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft"
          >
            <X size={18} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
});
