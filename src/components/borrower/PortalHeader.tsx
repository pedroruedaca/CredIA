import { DEFAULT_LENDER_COLOR } from "@/content/borrower-portal.es";
import { initials } from "@/lib/lender";

/** Co-branded header of the borrower portal (design/borrower-checklist.html). */
export function PortalHeader({ lenderName, brandColor }: { lenderName: string; brandColor: string | null }) {
  return (
    <header className="flex min-h-[72px] items-center gap-4 border-b border-line bg-surface px-4 sm:px-14">
      {lenderName && (
        <>
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white"
            style={{ background: brandColor ?? DEFAULT_LENDER_COLOR }}
          >
            {initials(lenderName)}
          </div>
          <div className="text-[15px] font-semibold">{lenderName}</div>
        </>
      )}
      <div className="grow" />
      <div className="text-right text-[13px] text-muted">
        Proceso gestionado con{" "}
        <span className="font-serif text-base font-semibold text-ink">
          cred<span className="text-accent">IA</span>
        </span>
      </div>
    </header>
  );
}
