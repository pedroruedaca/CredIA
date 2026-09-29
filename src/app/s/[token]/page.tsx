/**
 * Borrower portal (magic link). No Supabase session: the token in the URL is validated server-side on every
 * request and every write goes through /api/borrower/:token/… routes that validate it again.
 */
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { PORTAL_COPY } from "@/content/borrower.es";
import { productLabel } from "@/content/products.es";
import { loadChecklistRows, resolveBorrowerToken } from "@/lib/borrower/access";
import { buildChecklist } from "@/lib/borrower/checklist";
import { BorrowerPortal } from "./BorrowerPortal";

export const dynamic = "force-dynamic";

// Keep the token out of search engines and Referer headers.
export const metadata: Metadata = {
  title: "Documentación de tu solicitud · credIA",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8">
        <Logo className="text-ink [&>span]:text-accent" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
      </div>
    </main>
  );
}

export default async function BorrowerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveBorrowerToken(token);

  if (!access.ok) {
    return access.reason === "expired" ? (
      <LinkProblem
        title="Este enlace ha caducado"
        body="Por seguridad, los enlaces para aportar documentación caducan. Pide uno nuevo a la entidad que te lo envió; lo que ya hayas subido se conserva."
      />
    ) : (
      <LinkProblem
        title="Este enlace no es válido"
        body="Comprueba que has copiado el enlace completo del correo. Si el problema sigue, pide uno nuevo a la entidad que te lo envió."
      />
    );
  }

  const { kase } = access;
  const rows = await loadChecklistRows(access.db, kase.id);
  if (rows.error) {
    return (
      <LinkProblem
        title="No hemos podido cargar tu solicitud"
        body="Ha sido un problema nuestro. Recarga la página en unos minutos; tu progreso está guardado."
      />
    );
  }

  const checklist = buildChecklist(rows.requirements, rows.documents, rows.holded, kase.lender_name);
  const companyName = kase.borrower_name ?? kase.borrower_cif;
  const product = kase.requested_product && kase.requested_product !== "otro" ? productLabel(kase.requested_product) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-[72px] items-center gap-4 border-b border-line bg-surface px-4 py-3 sm:px-14">
        <div aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white">
          {initials(kase.lender_name)}
        </div>
        <div className="text-[15px] font-semibold">{kase.lender_name}</div>
        <div className="grow" />
        <div className="hidden items-baseline gap-1.5 text-[13px] text-muted sm:flex">
          {PORTAL_COPY.managedBy} <Logo className="text-base text-ink [&>span]:text-accent" />
        </div>
      </header>

      <BorrowerPortal
        token={token}
        lenderName={kase.lender_name}
        companyName={companyName}
        product={product}
        actor={access.actor}
        submittedAt={kase.submitted_at}
        consentWithdrawnAt={kase.consent_withdrawn_at}
        checklist={checklist}
      />
    </div>
  );
}
