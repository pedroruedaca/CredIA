"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PORTAL_COPY } from "@/content/borrower.es";
import type { Checklist } from "@/lib/borrower/checklist";
import type { RequirementKind } from "@/lib/cases/requirements";
import { formatDate } from "@/lib/format";
import { ChecklistRow } from "./ChecklistRow";
import { SharingCard } from "./SharingCard";

export function BorrowerPortal({
  token,
  lenderName,
  companyName,
  product,
  actor,
  submittedAt,
  consentWithdrawnAt,
  checklist,
}: {
  token: string;
  lenderName: string;
  companyName: string;
  product: string | null;
  actor: "borrower" | "delegate";
  submittedAt: string | null;
  consentWithdrawnAt: string | null;
  checklist: Checklist;
}) {
  const router = useRouter();
  // Exactly one item open at a time; starts on the first incomplete one.
  const [open, setOpen] = useState<RequirementKind | null>(checklist.expanded);
  const [lastDone, setLastDone] = useState(checklist.done);
  if (checklist.done !== lastDone) {
    // An item was just completed: move on to the next one, unless more files may follow (one per bank account).
    setLastDone(checklist.done);
    const current = checklist.items.find((i) => i.kind === open);
    if (checklist.done > lastDone && current?.state === "done" && current.kind !== "norma43") setOpen(checklist.expanded);
  }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const readOnly = !!consentWithdrawnAt;
  const pct = checklist.total === 0 ? 100 : Math.round((checklist.done / checklist.total) * 100);
  const remaining = checklist.total - checklist.done;
  const holded = checklist.items.find((i) => i.kind === "trial_balance")?.holded ?? null;

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/submit`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return setSubmitError(json.error ?? "No se pudo enviar.");
    router.refresh();
  }

  return (
    <div className="flex grow flex-col gap-10 px-4 py-8 sm:px-14 sm:py-10 lg:flex-row">
      <main className="flex min-w-0 grow flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <div className="text-sm text-ink-2">
            {companyName}
            {product && ` · Solicitud de ${product.toLowerCase()}`}
          </div>
          <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-[-0.01em] sm:text-[38px]">{PORTAL_COPY.heading}</h1>
          <p className="max-w-[680px] text-base leading-normal text-ink-2">{PORTAL_COPY.intro(lenderName)}</p>
        </div>

        {actor === "delegate" && (
          <p className="rounded-block bg-info-bg p-3 text-sm text-info">{PORTAL_COPY.delegateBanner(companyName)}</p>
        )}
        {consentWithdrawnAt && (
          <p role="status" className="rounded-block bg-line-row p-3 text-sm text-ink-2">
            Se retiró el consentimiento el {formatDate(consentWithdrawnAt)}. No se compartirá nada más con {lenderName}.
          </p>
        )}
        {submittedAt && !consentWithdrawnAt && (
          <p role="status" className="flex items-start gap-2 rounded-block bg-ok-bg p-3 text-sm text-ok">
            <CheckCircle2 size={18} className="mt-px shrink-0" aria-hidden />
            {PORTAL_COPY.submitted(lenderName)}
          </p>
        )}

        <div className="flex items-center gap-3.5">
          <div
            className="flex h-2 grow rounded bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={checklist.total}
            aria-valuenow={checklist.done}
            aria-label="Documentos obligatorios completados"
          >
            <div className="h-2 rounded bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="shrink-0 text-sm font-semibold">
            {checklist.done} de {checklist.total} completados
          </div>
        </div>

        {checklist.items.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-sm text-ink-2">
            {lenderName} aún no ha indicado qué documentos necesita. Te avisaremos cuando lo haga.
          </p>
        ) : (
          <ol className="flex flex-col rounded-card border border-line bg-surface">
            {checklist.items.map((item) => (
              <ChecklistRow
                key={item.kind}
                item={item}
                expanded={open === item.kind}
                onToggle={() => setOpen(open === item.kind ? null : item.kind)}
                token={token}
                lenderName={lenderName}
                readOnly={readOnly}
                canDelegate={actor === "borrower"}
              />
            ))}
          </ol>
        )}

        {!readOnly && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {!submittedAt && (
              <button
                type="button"
                onClick={submit}
                disabled={!checklist.canSubmit || submitting}
                className="h-12 shrink-0 rounded-lg bg-accent px-[22px] text-[15px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-[#C9CBD1] disabled:text-[#3A3D44]"
              >
                {submitting ? "Enviando…" : PORTAL_COPY.submit}
              </button>
            )}
            <span className="text-[13px] text-ink-2">
              {submittedAt ? "Puedes seguir añadiendo documentos si te los piden." : remaining > 0 ? PORTAL_COPY.remaining(remaining) : PORTAL_COPY.allDone}
            </span>
          </div>
        )}
        {submitError && <p role="alert" className="rounded-block bg-high-bg p-3 text-sm text-high">{submitError}</p>}
      </main>

      <aside className="flex w-full shrink-0 flex-col gap-[18px] pt-1 lg:w-[340px]">
        <SharingCard
          token={token}
          lenderName={lenderName}
          holded={holded}
          canWithdraw={actor === "borrower"}
          withdrawn={!!consentWithdrawnAt}
        />
      </aside>
    </div>
  );
}
