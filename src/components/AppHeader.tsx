import Link from "next/link";
import { initials, type LenderContext } from "@/lib/lender";
import { Logo } from "./Logo";

/** Lender header per design/lender-case-view.html. Sections not built yet are shown but not linked. */
export function AppHeader({ lender, active = "casos" }: { lender: LenderContext; active?: "casos" }) {
  return (
    <header className="flex h-16 items-center gap-6 bg-ink px-4 text-on-dark sm:gap-10 sm:px-10">
      <Link href="/casos" className="text-on-dark hover:text-on-dark hover:no-underline" aria-label="credIA, inicio">
        <Logo />
      </Link>
      <nav aria-label="Principal" className="flex gap-7 text-sm">
        <Link
          href="/casos"
          aria-current={active === "casos" ? "page" : undefined}
          className="font-semibold text-white hover:text-white"
        >
          Casos
        </Link>
        <span className="hidden cursor-not-allowed text-on-dark-muted/60 md:inline" aria-disabled="true" title="Próximamente">
          Plantillas de solicitud
        </span>
        <span className="hidden cursor-not-allowed text-on-dark-muted/60 md:inline" aria-disabled="true" title="Próximamente">
          Ajustes
        </span>
      </nav>
      <div className="grow" />
      <div className="hidden text-[13px] text-on-dark-muted sm:block">{lender.lenderName}</div>
      <details className="relative">
        <summary
          className="flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
          aria-label={`Cuenta de ${lender.email}`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-semibold">
            {initials(lender.email)}
          </span>
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-[10px] border border-line bg-surface p-3 text-sm text-ink shadow-lg">
          <p className="truncate text-muted">{lender.email}</p>
          <form action="/auth/salir" method="post" className="mt-2">
            <button type="submit" className="h-11 w-full rounded-lg border border-line-strong text-left px-3 font-medium hover:bg-surface-subtle">
              Cerrar sesión
            </button>
          </form>
        </div>
      </details>
    </header>
  );
}
