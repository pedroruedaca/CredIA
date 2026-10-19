/** «Políticas» | «Parámetros»: the two lists of the section, as pill links under the title. */
import Link from "next/link";
import { cx } from "@/components/ui/cx";

const TABS = [
  { id: "policies", href: "/politicas", label: "Políticas" },
  { id: "parameters", href: "/politicas/parametros", label: "Parámetros" },
] as const;

export function PolicyTabs({ current }: { current: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Políticas y parámetros" className="flex gap-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={cx(
            "inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-ink-2 transition-colors duration-150 hover:bg-soft hover:text-ink hover:no-underline",
            t.id === current && "bg-soft text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
