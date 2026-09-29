import Link from "next/link";
import { cx } from "./cx";

/**
 * primary = ink pill (the main action); secondary = soft pill; link = accent text link.
 * Accent is for progress, links, focus and the assistant, never for primary buttons.
 */
export type ButtonVariant = "primary" | "secondary" | "link";
type Size = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";
const VARIANT: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-ink text-white hover:bg-ink/85 hover:text-white hover:no-underline",
  secondary: "rounded-full bg-soft-control text-ink hover:bg-track/70 hover:text-ink hover:no-underline",
  link: "rounded-md text-accent underline-offset-4 hover:text-accent-hover hover:underline",
};
const SIZE: Record<ButtonVariant, Record<Size, string>> = {
  primary: { md: "min-h-11 px-5 text-[15px]", sm: "min-h-10 px-4 text-[13px]" },
  secondary: { md: "min-h-11 px-5 text-[15px]", sm: "min-h-10 px-4 text-[13px]" },
  link: { md: "min-h-11 text-[15px]", sm: "min-h-11 text-[13px]" },
};

export function buttonClass(variant: ButtonVariant = "primary", size: Size = "md", className?: string) {
  return cx(BASE, VARIANT[variant], SIZE[variant][size], className);
}

type Common = { variant?: ButtonVariant; size?: Size; className?: string; children: React.ReactNode };

export function Button({ variant, size, className, type = "button", ...rest }: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({ variant, size, className, href, ...rest }: Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest} />;
}
