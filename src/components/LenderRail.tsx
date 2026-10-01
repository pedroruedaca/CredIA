"use client";

/**
 * Lender navigation: 72px icon rail on the soft surface (design/lender-case-view2.html). The active item is a
 * white 44px tile with a small shadow. Bandeja shows its pending count. Sections not built yet are shown but
 * disabled. On phones the rail becomes a top bar.
 */
import { Briefcase, FileText, Inbox, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDismiss } from "./ui/useDismiss";
import { initials } from "@/lib/initials";
import { Button } from "./ui/Button";
import { cx } from "./ui/cx";

interface Item {
  label: string;
  icon: LucideIcon;
  href: string | null; // null = not built yet
  match?: RegExp;
}

const MAIN: Item[] = [
  { label: "Casos", icon: Briefcase, href: "/casos", match: /^\/casos(\/|$)/ },
  { label: "Bandeja", icon: Inbox, href: "/bandeja", match: /^\/bandeja(\/|$)/ },
  { label: "Plantillas", icon: FileText, href: "/plantillas", match: /^\/plantillas(\/|$)/ },
];
const SETTINGS: Item = { label: "Ajustes", icon: Settings, href: "/ajustes", match: /^\/ajustes(\/|$)/ };

const tile = "relative flex size-11 items-center justify-center rounded-[14px] transition-colors duration-150 ease-out";

function RailItem({ item, pathname, badge = 0 }: { item: Item; pathname: string; badge?: number }) {
  const Icon = item.icon;
  const active = !!item.match?.test(pathname);
  if (!item.href) {
    return (
      <span aria-disabled="true" title={`${item.label} · próximamente`} className={cx(tile, "cursor-not-allowed text-faint")}>
        <Icon size={20} strokeWidth={1.8} aria-hidden />
        <span className="sr-only">{item.label} (próximamente)</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cx(tile, active ? "bg-surface text-ink shadow-tile" : "text-muted hover:bg-surface/70 hover:text-ink")}
    >
      <Icon size={20} strokeWidth={1.8} aria-hidden />
      <span className="sr-only">{item.label}{badge > 0 ? ` (${badge} pendiente${badge === 1 ? "" : "s"})` : ""}</span>
      {badge > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function LenderRail({ email, lenderName, inboxCount = 0 }: { email: string; lenderName: string; inboxCount?: number }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Principal"
      className="sticky top-0 z-20 flex shrink-0 items-center gap-2 bg-soft px-3 py-2 sm:h-screen sm:w-[72px] sm:flex-col sm:px-0 sm:py-6"
    >
      <Link href="/casos" aria-label="credIA, inicio" className="mr-3 text-[17px] font-bold tracking-[-0.03em] text-ink hover:text-ink hover:no-underline sm:mb-5 sm:mr-0">
        c<span className="text-accent">IA</span>
      </Link>
      {MAIN.map((i) => <RailItem key={i.label} item={i} pathname={pathname} badge={i.href === "/bandeja" ? inboxCount : 0} />)}
      <div className="grow" />
      <RailItem item={SETTINGS} pathname={pathname} />
      <AccountMenu email={email} lenderName={lenderName} />
    </nav>
  );
}

/** Account popover: opens from the avatar; closes on Esc, a click outside, or moving to another page. */
function AccountMenu({ email, lenderName }: { email: string; lenderName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref, true);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`Cuenta de ${email}`}
        className="flex size-11 items-center justify-center rounded-full"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{initials(email)}</span>
      </button>
      {open && (
        <div id="account-menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-[20px] bg-surface p-3 text-sm shadow-float sm:bottom-0 sm:left-full sm:right-auto sm:top-auto sm:ml-3 sm:mt-0">
          <p className="truncate px-1 font-medium text-ink">{lenderName}</p>
          <p className="truncate px-1 text-muted">{email}</p>
          <form action="/auth/salir" method="post" className="mt-3">
            <Button type="submit" variant="secondary" size="sm" className="w-full">Cerrar sesión</Button>
          </form>
        </div>
      )}
    </div>
  );
}
