"use client";

/**
 * Hover/focus tooltip: a small floating panel (shadow-float) with a title and an optional explanatory line, in place
 * of the browser's native `title`. Opens after a short delay on hover (instantly when another tooltip was just open)
 * and at once on keyboard focus; closes on leave, blur, Esc, press or scroll. Rendered in a portal with fixed
 * positioning so lists with overflow never clip it; it flips to the other side and stays inside the viewport.
 * Touch never opens it: on phones the trigger's own label does the job.
 */
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";

type Side = "top" | "bottom" | "right";

const OPEN_DELAY = 350;
const GAP = 8;
const MARGIN = 8;
let lastClosedAt = 0; // shared: moving along a toolbar shows the next tooltip without waiting again

export function Tooltip({
  label,
  hint,
  meta,
  side = "top",
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Short figure next to the title (a count, a shortcut), set in mono. */
  meta?: ReactNode;
  side?: Side;
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; side: Side } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback((immediate: boolean) => {
    clear();
    if (immediate || Date.now() - lastClosedAt < 400) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, []);
  const hide = useCallback(() => {
    clear();
    setOpen((o) => {
      if (o) lastClosedAt = Date.now();
      return false;
    });
    setPos(null);
  }, []);

  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return;
    setPos(place(anchor.current.getBoundingClientRect(), panel.current.getBoundingClientRect(), side));
  }, [open, side, label, hint]);

  const trigger = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], open ? id : null].filter(Boolean).join(" ") || undefined,
      })
    : children;

  return (
    <span
      ref={anchor}
      className={cx("inline-flex", className)}
      onPointerEnter={(e) => e.pointerType !== "touch" && show(false)}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => e.target.matches(":focus-visible") && show(true)}
      onBlur={hide}
    >
      {trigger}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="tooltip"
            data-side={pos?.side}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className={cx(
              "pointer-events-none fixed z-50 max-w-[260px] rounded-[14px] bg-surface px-3 py-2 text-left shadow-float",
              "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
              pos ? "translate-y-0 opacity-100" : cx("opacity-0", side === "bottom" ? "-translate-y-1" : side === "top" ? "translate-y-1" : ""),
            )}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold leading-snug text-ink">{label}</span>
              {meta != null && <span className="shrink-0 font-mono text-[12px] text-accent">{meta}</span>}
            </span>
            {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{hint}</span>}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Pure placement: preferred side, flipped when it does not fit, clamped inside the viewport. Exported for tests. */
export function place(
  a: { top: number; bottom: number; left: number; right: number; width: number; height: number },
  p: { width: number; height: number },
  side: Side,
  vw = typeof window === "undefined" ? 1024 : window.innerWidth,
  vh = typeof window === "undefined" ? 768 : window.innerHeight,
): { top: number; left: number; side: Side } {
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - p.width - MARGIN));
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - p.height - MARGIN));
  const fitsTop = a.top - GAP - p.height >= MARGIN;
  const fitsBottom = a.bottom + GAP + p.height <= vh - MARGIN;
  const fitsRight = a.right + GAP + p.width <= vw - MARGIN;
  let s: Side = side;
  if (s === "right" && !fitsRight) s = fitsBottom ? "bottom" : "top";
  if (s === "top" && !fitsTop && fitsBottom) s = "bottom";
  if (s === "bottom" && !fitsBottom && fitsTop) s = "top";
  if (s === "right") return { side: s, left: a.right + GAP, top: clampY(a.top + a.height / 2 - p.height / 2) };
  const left = clampX(a.left + a.width / 2 - p.width / 2);
  return { side: s, left, top: s === "top" ? a.top - GAP - p.height : a.bottom + GAP };
}
