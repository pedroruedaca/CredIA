"use client";

/**
 * «Eliminar caso» (owners only), at the end of «Detalles»: says what goes, asks for the company's CIF, then deletes
 * the case, its data and its files for good (deleteCase). Errors are one line with a pill; nothing is half-deleted
 * silently (the action stops before the rows if any file cannot be removed).
 */
import { useRef, useState, useTransition } from "react";
import { deleteCase } from "@/app/casos/[id]/delete-action";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { DELETE_CASE_COPY as COPY } from "@/content/data-protection.es";
import { confirmsDeletion } from "@/lib/cases/deletion";

export function DeleteCase({ caseId, cif, companyName }: { caseId: string; cif: string; companyName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = confirmsDeletion(typed, cif);

  const submit = () =>
    start(async () => {
      setError(null);
      // On success the action redirects to the case list; it only returns on failure.
      const r = await deleteCase(caseId, typed).catch(() => ({ ok: false as const, message: COPY.failed }));
      if (r && !r.ok) setError(r.message);
    });

  return (
    <section aria-label={COPY.title} className="mt-8 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
      <div className="grow text-sm">
        <h3 className="font-medium">{COPY.title}</h3>
        <p className="text-muted">{COPY.hint}</p>
      </div>
      <Button variant="secondary" size="sm" className="text-high" onClick={() => dialog.current?.showModal()}>{COPY.title}</Button>
      <Modal ref={dialog} title={COPY.confirmTitle(companyName)} onClose={() => { setTyped(""); setError(null); }}>
        <p className="text-[15px] text-ink-2">{COPY.explain}</p>
        <ul className="list-disc pl-5 text-sm text-ink-2">
          {COPY.whatGoes.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <p className="text-sm text-muted">{COPY.notReversible}</p>
        <label htmlFor="delete-cif" className="text-sm font-medium">{COPY.typeCif(cif)}</label>
        <Input id="delete-cif" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" aria-invalid={error ? true : undefined} />
        {error && <p className="flex items-center gap-2 text-sm text-high"><Pill tone="high">Error</Pill>{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={!matches || pending}>{pending ? COPY.deleting : COPY.confirm}</Button>
        </div>
      </Modal>
    </section>
  );
}
