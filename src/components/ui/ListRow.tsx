import Link from "next/link";
import { cx } from "./cx";

/**
 * A row in an open list: no container, 16px radius, soft fill on hover/selected. The negative horizontal
 * margin keeps the row's text aligned with the heading above it.
 */
export function listRowClass(selected = false, interactive = true, className?: string) {
  return cx(
    "-mx-4 flex items-center gap-4 rounded-row px-4 py-3.5 transition-colors duration-150 ease-out",
    interactive && "hover:bg-soft",
    selected && "bg-soft",
    className,
  );
}

type Props = { selected?: boolean; className?: string; children: React.ReactNode };

export function ListRow({ selected, className, children, ...rest }: Props & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={listRowClass(selected, false, className)} {...rest}>{children}</div>;
}

export function ListRowLink({ href, selected, className, children, ...rest }: Props & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} aria-current={selected ? "true" : undefined} className={listRowClass(selected, true, cx("text-ink hover:text-ink hover:no-underline", className))} {...rest}>
      {children}
    </Link>
  );
}
