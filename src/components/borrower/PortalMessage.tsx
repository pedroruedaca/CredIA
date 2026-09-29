import { Logo } from "@/components/Logo";
import { SUPPORT_EMAIL } from "@/content/borrower-portal.es";

/** Full-page message for the borrower portal: invalid or expired link, withdrawn consent, load errors. */
export function PortalMessage({ title, children, lenderName }: { title: string; children: React.ReactNode; lenderName?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8">
        <Logo className="text-ink [&>span]:text-accent" />
        <h1 className="mt-4 font-serif text-2xl font-semibold leading-tight">{title}</h1>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-2">{children}</div>
        <p className="mt-4 text-sm text-ink-2">
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
