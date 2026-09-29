"use client";

/** Phones: the timeline collapses into a "Pasos" button that opens a bottom sheet. */
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { ChecklistItem } from "@/lib/borrower/checklist";
import type { StepId } from "@/lib/borrower/steps";
import { StepTimeline } from "./StepTimeline";

export function MobileSteps({ items, current, allDone, footer }: { items: ChecklistItem[]; current: StepId; allDone: boolean; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-soft-control px-4 text-sm font-medium text-ink"
      >
        <ListChecks size={16} strokeWidth={1.8} aria-hidden /> Pasos
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pasos" className="max-h-[80vh]">
        <StepTimeline items={items} current={current} allDone={allDone} onNavigate={() => setOpen(false)} />
        {footer && <div className="mt-6">{footer}</div>}
      </Sheet>
    </>
  );
}
