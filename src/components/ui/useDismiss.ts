"use client";

import { useEffect, type RefObject } from "react";

/** Esc closes; optionally a pointer-down outside `ref` closes too. */
export function useDismiss(open: boolean, onClose: () => void, ref?: RefObject<HTMLElement | null>, outside = false) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (outside && ref?.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose, ref, outside]);
}
