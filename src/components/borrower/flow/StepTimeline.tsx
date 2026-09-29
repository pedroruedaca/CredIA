/**
 * Vertical step timeline (design/borrower-flow2.html). done = filled accent check · current = white dot with
 * accent ring + halo, "Ahora" · needs attention = amber dot + one-line fix · pending = hollow dot + estimate.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { REVIEW_STEP, STEP_COPY } from "@/content/borrower-portal.es";
import type { ChecklistItem } from "@/lib/borrower/checklist";
import { REVIEW, type StepId } from "@/lib/borrower/steps";

type Entry = { id: StepId; label: string; state: ChecklistItem["state"] | "review"; sub: string | null; index: number };

function Marker({ entry, current }: { entry: Entry; current: boolean }) {
  const base = "flex size-6 shrink-0 items-center justify-center rounded-full";
  if (current) {
    return <span className={cx(base, "bg-surface font-mono text-xs font-semibold text-accent shadow-[0_0_0_2px_var(--color-accent),0_0_0_7px_var(--color-accent-ring)]")}>{entry.index}</span>;
  }
  if (entry.state === "done") return <span className={cx(base, "bg-accent")}><Check size={13} strokeWidth={3} className="text-white" aria-hidden /></span>;
  if (entry.state === "attention") return <span className={cx(base, "bg-warn-bg font-bold text-warn text-sm")} aria-hidden>!</span>;
  return <span className={cx(base, "border-2 border-track")} aria-hidden />;
}

const STATE_LABEL: Record<Entry["state"], string> = {
  done: "Completado",
  attention: "Necesita tu atención",
  pending: "Pendiente",
  in_progress: "En curso",
  review: "Último paso",
};

export function StepTimeline({ items, current, allDone, onNavigate }: { items: ChecklistItem[]; current: StepId; allDone: boolean; onNavigate?: () => void }) {
  const entries: Entry[] = [
    ...items.map((i, n) => ({
      id: i.kind,
      label: STEP_COPY[i.kind].short,
      state: i.state,
      sub: i.state === "attention" ? i.fix : i.state === "done" ? i.summary : i.state === "in_progress" ? (i.summary ?? "En curso") : STEP_COPY[i.kind].estimate,
      index: n + 1,
    })),
    { id: REVIEW, label: REVIEW_STEP.short, state: allDone ? "pending" : "review", sub: allDone ? "Todo listo" : null, index: items.length + 1 },
  ];

  return (
    <ol aria-label="Pasos" className="flex flex-col">
      {entries.map((e, n) => {
        const isCurrent = e.id === current;
        const last = n === entries.length - 1;
        return (
          <li key={e.id} className="flex gap-3.5">
            <div className="flex flex-col items-center pt-2.5">
              <Marker entry={e} current={isCurrent} />
              {!last && <span aria-hidden className={cx("mt-1 w-0.5 grow min-h-[22px]", e.state === "done" && !isCurrent ? "bg-accent" : "bg-track")} />}
            </div>
            <Link
              href={`?paso=${e.id}`}
              onClick={onNavigate}
              aria-current={isCurrent ? "step" : undefined}
              className="-mx-2 mb-1 min-h-11 min-w-0 grow rounded-[12px] px-2 py-2 text-ink transition-colors duration-150 hover:bg-surface/70 hover:text-ink hover:no-underline"
            >
              <div className={cx("text-sm", isCurrent ? "font-semibold" : "font-medium", e.state === "pending" && !isCurrent && "text-ink-2")}>{e.label}</div>
              <div className={cx("line-clamp-2 text-xs", isCurrent ? "text-accent" : e.state === "attention" ? "text-warn" : "text-muted")}>
                {isCurrent ? "Ahora" : e.sub}
              </div>
              <span className="sr-only">. {STATE_LABEL[e.state]}.</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
