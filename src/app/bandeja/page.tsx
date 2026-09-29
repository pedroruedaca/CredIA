/** Bandeja: what needs attention across all cases (help requests, submissions, withdrawn consent, reviews). */
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ErrorLine } from "@/components/states/ErrorLine";
import { Pill } from "@/components/ui/Pill";
import { SeverityDot } from "@/components/ui/SeverityDot";
import { cx } from "@/components/ui/cx";
import { DOC_KIND_LABEL } from "@/content/case-view.es";
import { ACTOR_LABEL, INBOX_KIND_LABEL, INBOX_TITLE, INBOX_TONE } from "@/content/inbox.es";
import { INBOX_WINDOW_DAYS, type InboxItem } from "@/lib/inbox/build";
import { loadInbox } from "@/lib/inbox/load";
import { relativeTime } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";
import { CloseButton } from "./CloseButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bandeja · credIA" };

function Row({ item, canEdit, now }: { item: InboxItem; canEdit: boolean; now: Date }) {
  const sub =
    item.kind === "support"
      ? item.detail
        ? `«${item.detail}» · ${ACTOR_LABEL[item.actor ?? "borrower"]}`
        : `Sin mensaje · ${ACTOR_LABEL[item.actor ?? "borrower"]}`
      : item.kind === "needs_review"
        ? `${DOC_KIND_LABEL[item.detail ?? ""] ?? "Documento"}: credIA no ha podido leerlo con seguridad`
        : item.kind === "submitted"
          ? "Abre el caso para ver el paquete"
          : "Ya no puede aportar documentos";
  return (
    <li className={cx("-mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-row px-4 py-3.5 transition-colors duration-150 hover:bg-soft", !item.pending && "opacity-60")}>
      <SeverityDot tone={item.pending ? INBOX_TONE[item.kind] : "neutral"} className="size-2.5" />
      <Link href={`/casos/${item.caseId}`} className="flex min-w-0 grow basis-64 flex-col gap-0.5 text-ink hover:text-ink hover:no-underline">
        <span className="text-[15px] font-medium">{INBOX_TITLE[item.kind](item.company)}</span>
        <span className="line-clamp-2 text-[13px] text-muted">{sub}</span>
      </Link>
      <Pill tone={item.pending ? INBOX_TONE[item.kind] : "neutral"} dot={false} className="hidden sm:inline-flex">{INBOX_KIND_LABEL[item.kind]}</Pill>
      <time dateTime={item.at} className="w-24 text-right text-[13px] text-muted">{relativeTime(item.at, now)}</time>
      {item.kind === "support" && item.pending && canEdit && item.supportRequestId ? (
        <CloseButton id={item.supportRequestId} />
      ) : (
        <Link href={`/casos/${item.caseId}`} aria-label={`Abrir el caso de ${item.company}`} className="flex size-11 items-center justify-center rounded-full text-faint hover:bg-soft-control hover:text-ink">
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </Link>
      )}
    </li>
  );
}

export default async function BandejaPage() {
  const lender = await requireLender();
  const inbox = await loadInbox(await createClient());
  const now = new Date();
  const pending = inbox.items.filter((i) => i.pending);
  const done = inbox.items.filter((i) => !i.pending);
  const canEdit = lender.role !== "viewer";

  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14 sm:py-12">
      <h1 className="heading-page">Bandeja</h1>
      <p className="mt-3 text-[17px] text-ink-2">Lo que necesita tu atención en todos los casos.</p>

      {inbox.failed && <div className="mt-8"><ErrorLine message="No hemos podido cargar toda la bandeja. Recarga la página." /></div>}

      <section aria-labelledby="pendiente" className="mt-10">
        <div className="mb-2 flex items-baseline gap-2.5">
          <h2 id="pendiente" className="heading-section">Pendiente</h2>
          <span className="text-[13px] text-muted">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="rounded-panel bg-soft px-8 py-10 text-center">
            <p className="heading-section">Todo al día</p>
            <p className="mt-1 text-[15px] text-ink-2">Aquí aparecerán las peticiones de ayuda, los envíos de documentación y lo que haya que revisar.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">{pending.map((i) => <Row key={i.id} item={i} canEdit={canEdit} now={now} />)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="resuelto" className="mt-12">
          <div className="mb-2 flex items-baseline gap-2.5">
            <h2 id="resuelto" className="heading-section">Resuelto</h2>
            <span className="text-[13px] text-muted">últimos {INBOX_WINDOW_DAYS} días</span>
          </div>
          <ul className="flex flex-col gap-1">{done.map((i) => <Row key={i.id} item={i} canEdit={canEdit} now={now} />)}</ul>
        </section>
      )}
    </main>
  );
}
