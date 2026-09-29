import Link from "next/link";
import { initials, type LenderContext } from "@/lib/lender";
import { Logo } from "./Logo";
import { Button } from "./ui/Button";

/** Lender header. Sections not built yet are shown but not linked. (Becomes the left icon rail in step 2.) */
export function AppHeader({ lender, active = "casos" }: { lender: LenderContext; active?: "casos" }) {
  return (
    <header className="flex h-16 items-center gap-6 bg-soft px-4 sm:gap-10 sm:px-10">
      <Link href="/casos" className="hover:no-underline" aria-label="credIA, inicio">
        <Logo />
      </Link>
      <nav aria-label="Principal" className="flex gap-7 text-sm">
        <Link href="/casos" aria-current={active === "casos" ? "page" : undefined} className="font-semibold text-ink hover:text-ink">
          Casos
        </Link>
        <span className="hidden cursor-not-allowed text-muted md:inline" aria-disabled="true" title="Próximamente">
          Plantillas de solicitud
        </span>
        <span className="hidden cursor-not-allowed text-muted md:inline" aria-disabled="true" title="Próximamente">
          Ajustes
        </span>
      </nav>
      <div className="grow" />
      <div className="hidden text-[13px] text-ink-2 sm:block">{lender.lenderName}</div>
      <details className="relative">
        <summary className="flex size-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden" aria-label={`Cuenta de ${lender.email}`}>
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">{initials(lender.email)}</span>
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-60 rounded-[20px] bg-surface p-3 text-sm shadow-float">
          <p className="truncate px-1 text-muted">{lender.email}</p>
          <form action="/auth/salir" method="post" className="mt-2">
            <Button type="submit" variant="secondary" size="sm" className="w-full">Cerrar sesión</Button>
          </form>
        </div>
      </details>
    </header>
  );
}
