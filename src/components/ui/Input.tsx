import { forwardRef } from "react";
import { cx } from "./cx";

/** Soft fill, no border, 14px radius, 44px min height; focus = 2px accent ring; invalid = high ring. */
export const fieldClass =
  "min-h-11 w-full rounded-input bg-soft px-3.5 text-[15px] text-ink placeholder:text-muted outline-none transition-shadow duration-150 focus:ring-2 focus:ring-accent aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-high-dot disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldClass, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldClass, "py-3", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx(fieldClass, "pr-8", className)} {...rest} />;
});

/** Label + control + hint/error, stacked. */
export function Field({ id, label, hint, error, children, className }: { id: string; label: React.ReactNode; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-[13px] text-high">{error}</p>}
    </div>
  );
}
