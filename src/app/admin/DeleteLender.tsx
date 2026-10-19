"use client";

/**
 * «Eliminar entidad» on a row of /admin: says what goes, asks for the lender's name, then deletes the lender, its cases,
 * files and team accounts for good (deleteLender). Errors are one line with a pill; on success the page reloads.
 */
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { DELETE_LENDER_COPY as COPY } from "@/content/data-protection.es";
import { confirmsLenderName } from "@/lib/platform/admin";
import { deleteLender } from "./actions";

export function DeleteLender({ lenderId, name, cases, members }: { lenderId: string; name: string; cases: number; members: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = confirmsLenderName(typed, name);
  const inputId = `delete-lender-${lenderId}`;

  const submit = () =>
    start(async () => {
      setError(null);
      // On success the action redirects back to /admin; it only returns on failure.
      const r = await deleteLender(lenderId, typed).catch(() => ({ ok: false as const, message: COPY.failed }));
      if (r && !r.ok) setError(r.message);
    });

  return (
    <>
      <Button variant="secondary" size="sm" className="text-high" onClick={() => dialog.current?.showModal()}>{COPY.button}</Button>
      <Modal ref={dialog} title={COPY.confirmTitle(name)} onClose={() => { setTyped(""); setError(null); }}>
        <p className="text-[15px] text-ink-2">{COPY.explain}</p>
        <ul className="list-disc pl-5 text-sm text-ink-2">
          {COPY.whatGoes(cases, members).map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p className="text-sm text-muted">{COPY.notReversible}</p>
        <label htmlFor={inputId} className="text-sm font-medium">{COPY.typeName(name)}</label>
        <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={error ? true : undefined} />
        {error && <p className="flex items-center gap-2 text-sm text-high"><Pill tone="high">Error</Pill>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={!matches || pending}>{pending ? COPY.deleting : COPY.confirm}</Button>
        </div>
      </Modal>
    </>
  );
}
