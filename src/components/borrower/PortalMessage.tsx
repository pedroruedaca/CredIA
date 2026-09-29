import { Logo } from "@/components/Logo";
import { SUPPORT_EMAIL } from "@/content/borrower-portal.es";

/** Full-page message for the borrower portal: invalid or expired link, withdrawn consent, load errors. */
export function PortalMessage({ title, children, lenderName }: { title: string; children: React.ReactNode; lenderName?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Logo />
        <h1 className="heading-page mt-4">{title}</h1>
        <div className="flex flex-col gap-2 text-[17px] leading-relaxed text-ink-2">{children}</div>
        <p className="mt-2 text-[15px] text-ink-2">
          {SUPPORT_EMAIL ? (
            <>¿Dudas? Escríbenos a <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>
          ) : (
            <>¿Dudas? Contacta con {lenderName ?? "la entidad que te envió el enlace"}.</>
          )}
        </p>
      </div>
    </main>
  );
}
