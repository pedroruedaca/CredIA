"use client";

/**
 * «Conclusiones del analista»: answers of «Preguntar al caso» the team kept, each figure with its source. Not a
 * module: it is always drawn after the modules and always printed in the PDF (like the statements appendix), so a
 * layout can never hide what an analyst wrote down. Owners and analysts can remove one; nothing when there are none.
 */
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeConclusion } from "@/app/casos/conclusion-actions";
import { CitedText } from "@/components/case/CitedText";
import { Pill } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { CONCLUSIONS_COPY as COPY } from "@/content/analyst-chat.es";
import type { Conclusion } from "@/lib/case-view/load";
import { formatDate } from "@/lib/format";

export function ConclusionsSection({ caseId, conclusions, canEdit }: { caseId: string; conclusions: Conclusion[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!conclusions.length) return null;
  const remove = async (id: string) => {
    if (!window.confirm(COPY.removeConfirm)) return;
    setBusy(id);
    const r = await removeConclusion(caseId, id).catch(() => ({ ok: false as const, message: "No hemos podido quitar la conclusión." }));
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.message);
  };
  return (
    <section id="conclusiones" aria-labelledby="conclusiones-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="conclusiones-title" className="heading-section">{COPY.title}</h2>
        <span className="text-[13px] text-muted">{COPY.intro}</span>
      </div>
      {error && <p className="flex items-center gap-2 text-[13px] text-high"><Pill tone="high">Error</Pill>{error}</p>}
      <ul className="flex flex-col gap-2">
        {conclusions.map((c) => (
          <li key={c.id} className="-mx-4 flex gap-3 rounded-row px-4 py-3 hover:bg-soft">
            <div className="flex min-w-0 grow flex-col gap-1.5 text-[15px] leading-normal">
              {c.question && <p className="text-[13px] text-muted">{COPY.question}: {c.question}</p>}
              <CitedText text={c.text} citations={c.citations} />
              <p className="font-mono text-xs text-muted">{formatDate(c.createdAt)}</p>
            </div>
            {canEdit && (
              <Tooltip label={COPY.remove}>
                <button type="button" onClick={() => remove(c.id)} disabled={busy === c.id} aria-label={COPY.remove} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft-control hover:text-ink disabled:opacity-50">
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                </button>
              </Tooltip>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
