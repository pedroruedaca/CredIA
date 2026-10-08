"use client";

/**
 * «Cerrar caso» (owners and analysts): the reason (decided, declined, withdrawn), what closing does and how long the
 * lender keeps closed cases; «Reabrir caso» on a closed case. Errors are one line with a pill.
 */
import { useRef, useState, useTransition } from "react";
import { closeCase, reopenCase } from "@/app/casos/[id]/close-action";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { CLOSE_CASE_COPY as COPY, CLOSE_REASON_HINT, CLOSE_REASON_LABEL, REOPEN_CASE_COPY } from "@/content/case-closing.es";
import { CLOSE_REASONS, type CloseReason } from "@/lib/cases/closing";

export function CloseCase({ caseId, companyName, retentionMonths }: { caseId: string; companyName: string; retentionMonths: number | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<CloseReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (!reason) return;
      setError(null);
      const r = await closeCase(caseId, reason).catch(() => ({ ok: false as const, message: COPY.failed }));
      if (r.ok) dialog.current?.close();
      else setError(r.message);
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">{COPY.button}</Button>
      <Modal ref={dialog} title={COPY.title(companyName)} onClose={() => { setReason(null); setError(null); }}>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-sm font-medium">{COPY.reasonLabel}</legend>
          {CLOSE_REASONS.map((r) => (
            <label key={r} className="-mx-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-row px-3 py-2.5 hover:bg-soft">
              <input type="radio" name="close-reason" className="mt-1 size-4 accent-[#0E5A61]" checked={reason === r} onChange={() => setReason(r)} />
              <span className="flex flex-col">
                <span className="text-[15px]">{CLOSE_REASON_LABEL[r]}</span>
                <span className="text-[13px] text-muted">{CLOSE_REASON_HINT[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <ul className="list-disc pl-5 text-sm text-ink-2">
          {COPY.effects.map((x) => <li key={x}>{x}</li>)}
        </ul>
        {retentionMonths !== null && <p className="text-sm text-muted">{COPY.retention(retentionMonths)}</p>}
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Error</Pill>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={!reason || pending}>{pending ? COPY.closing : COPY.confirm}</Button>
        </div>
      </Modal>
    </>
  );
}

export function ReopenCase({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await reopenCase(caseId).catch(() => ({ ok: false as const, message: REOPEN_CASE_COPY.failed }));
            if (!r.ok) setError(r.message);
          })
        }
      >
        {pending ? REOPEN_CASE_COPY.reopening : REOPEN_CASE_COPY.button}
      </Button>
      {error && <span role="alert" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Error</Pill>{error}</span>}
    </span>
  );
}
