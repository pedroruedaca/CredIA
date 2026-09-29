"use client";

/** Borrower checklist (design/borrower-checklist.html): one item expanded at a time, the first incomplete by default. */
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectHolded } from "@/components/ConnectHolded";
import { RichText } from "@/components/RichText";
import { BANKS, N43_FALLBACK } from "@/content/banks.es";
import { ITEM_COPY } from "@/content/borrower-portal.es";
import { OPEN_STEP_EVENT } from "@/lib/assistant/protocol";
import { freshnessWindow, type ChecklistItem, type ItemState } from "@/lib/borrower/checklist";
import type { RequirementKind } from "@/lib/cases/requirements";
import { DelegateDialog } from "./DelegateDialog";
import { UploadDropzone } from "./UploadDropzone";

interface Props {
  token: string;
  actor: "borrower" | "delegate";
  lenderName: string;
  today: string;
  items: ChecklistItem[];
  firstIncomplete: RequirementKind | null;
}

const CHIP: Record<ItemState, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-info-bg text-info" },
  in_progress: { label: "En curso", className: "bg-info-bg text-info" },
  attention: { label: "Revisar", className: "bg-warn-bg text-warn" },
  done: { label: "Completado", className: "bg-ok-bg text-ok" },
};

export function Checklist({ token, actor, lenderName, today, items, firstIncomplete }: Props) {
  const [open, setOpen] = useState<RequirementKind | null>(firstIncomplete);

  // When the open item gets completed, move on to the next incomplete one.
  const prevStates = useRef(new Map(items.map((i) => [i.kind, i.state])));
  useEffect(() => {
    const prev = prevStates.current;
    const current = items.find((i) => i.kind === open);
    if (current && current.state === "done" && prev.get(current.kind) !== "done") setOpen(firstIncomplete);
    prevStates.current = new Map(items.map((i) => [i.kind, i.state]));
  }, [items, open, firstIncomplete]);

  // "Ir al paso N" links in the assistant open the step and bring it into view.
  useEffect(() => {
    const onStep = (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      if (!items.some((i) => i.kind === kind)) return;
      setOpen(kind as RequirementKind);
      requestAnimationFrame(() => document.getElementById(`paso-${kind}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(OPEN_STEP_EVENT, onStep);
    return () => window.removeEventListener(OPEN_STEP_EVENT, onStep);
  }, [items]);

  return (
    <div className="flex flex-col rounded-card border border-line bg-surface">
      {items.map((item, idx) => (
        <Item
          key={item.kind}
          item={item}
          index={idx + 1}
          open={open === item.kind}
          onToggle={() => setOpen(open === item.kind ? null : item.kind)}
          onOpen={() => setOpen(item.kind)}
          token={token}
          actor={actor}
          lenderName={lenderName}
          today={today}
        />
      ))}
    </div>
  );
}

function StateIcon({ state, index, open }: { state: ItemState; index: number; open: boolean }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full";
  if (state === "done") return <span className={`${base} bg-ok-bg text-ok`}><Check size={16} strokeWidth={2.5} aria-hidden /></span>;
  if (state === "attention") return <span className={`${base} bg-warn-bg text-warn-icon`}><AlertCircle size={16} strokeWidth={2.5} aria-hidden /></span>;
  if (state === "in_progress") return <span className={`${base} bg-info-bg text-info-icon`}><Loader2 size={16} className="animate-spin" aria-hidden /></span>;
  return (
    <span className={`${base} border-2 text-[13px] font-semibold ${open ? "border-accent text-accent" : "border-line-strong text-muted"}`} aria-hidden>
      {index}
    </span>
  );
}

interface ItemProps {
  item: ChecklistItem;
  index: number;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  token: string;
  actor: "borrower" | "delegate";
  lenderName: string;
  today: string;
}

function Item({ item, index, open, onToggle, onOpen, token, actor, lenderName, today }: ItemProps) {
  const copy = ITEM_COPY[item.kind];
  const panelId = `paso-${item.kind}`;
  const holded = item.holded;
  const canRevokeHolded = item.kind === "trial_balance" && holded?.status === "synced" && holded.mode === "refresh" && !holded.revoked_at;

  const subtitle = item.state === "attention" ? item.fix : open || item.state === "pending" ? copy.description : (item.summary ?? copy.description);

  return (
    <div id={panelId} className={`scroll-mt-4 border-b border-line-row last:border-0 ${open ? "bg-surface-subtle" : ""}`}>
      <div className="flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-[22px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${panelId}-panel`}
          className="flex min-h-11 min-w-0 grow items-start gap-3 text-left sm:gap-4"
        >
          <StateIcon state={item.state} index={index} open={open} />
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="text-[15px] font-semibold">
              {copy.title}
              {!item.required && <span className="ml-2 text-[13px] font-normal text-muted">(opcional)</span>}
              <span className="sr-only">. Paso {index}. {CHIP[item.state].label}.</span>
            </span>
            <span className={`text-[13px] ${item.state === "attention" ? "text-warn" : "text-ink-2"}`}>{subtitle}</span>
          </span>
        </button>
        {canRevokeHolded && !open && <RevokeHolded token={token} />}
        {item.state === "attention" && !open && (
          <button
            type="button"
            onClick={onOpen}
            className="h-10 shrink-0 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-subtle"
          >
            {item.kind === "trial_balance" ? "Resolver" : "Subir uno nuevo"}
          </button>
        )}
        {(item.state === "pending" || item.state === "in_progress" || (open && item.state !== "attention")) && (
          <span aria-hidden className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[item.state].className}`}>
            {CHIP[item.state].label}
          </span>
        )}
      </div>

      {open && (
        <div id={`${panelId}-panel`} className="flex flex-col gap-4 px-4 pb-6 sm:ml-11 sm:px-[22px]">
          <Panel item={item} token={token} lenderName={lenderName} today={today} />
          {item.files.length > 0 && (
            <div className="flex flex-col gap-1 text-[13px]">
              <div className="font-medium text-ink-2">Ficheros recibidos</div>
              <ul className="flex flex-col gap-1">
                {item.files.map((f) => (
                  <li key={f.id} className="flex gap-1.5">
                    <span className="break-all">{f.name}</span>
                    <span className={f.tone === "problem" ? "text-high" : f.tone === "ok" ? "text-ok" : "text-ink-2"}>· {f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canRevokeHolded && <RevokeHolded token={token} />}
          {actor === "borrower" && <DelegateDialog token={token} lenderName={lenderName} />}
        </div>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-0.5 pl-5 text-sm leading-relaxed text-ink-2">
      {steps.map((s) => (
        <li key={s}><RichText text={s} /></li>
      ))}
    </ol>
  );
}

function Panel({ item, token, lenderName, today }: { item: ChecklistItem; token: string; lenderName: string; today: string }) {
  if (item.kind === "trial_balance") {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <ConnectHolded token={token} />
        <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
          <div>
            <h3 className="text-[15px] font-semibold">O sube el sumas y saldos</h3>
            <p className="mt-0.5 text-sm text-ink-2">Desde cualquier programa de contabilidad.</p>
          </div>
          <Steps steps={ITEM_COPY.trial_balance.steps} />
          <UploadDropzone token={token} kind="trial_balance" today={today} />
        </div>
      </div>
    );
  }
  if (item.kind === "norma43") return <Norma43Panel token={token} today={today} />;

  return (
    <>
      <Steps steps={ITEM_COPY[item.kind].steps} />
      {item.maxAgeDays && (
        <p className="text-[13px] text-ink-2">
          {lenderName} necesita que sea {freshnessWindow(item.maxAgeDays)}.
        </p>
      )}
      <UploadDropzone token={token} kind={item.kind} needsIssueDate={item.maxAgeDays !== null} today={today} />
    </>
  );
}

function Norma43Panel({ token, today }: { token: string; today: string }) {
  const [bankId, setBankId] = useState(BANKS[0].id);
  const bank = BANKS.find((b) => b.id === bankId)!;
  return (
    <>
      <div role="radiogroup" aria-label="Tu banco" className="flex flex-wrap gap-2">
        {BANKS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={b.id === bankId}
            onClick={() => setBankId(b.id)}
            className={`h-11 rounded-full border px-3.5 text-[13px] sm:h-9 ${
              b.id === bankId ? "border-accent bg-accent font-medium text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-subtle"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>
      <Steps steps={bank.steps} />
      <UploadDropzone token={token} kind="norma43" bank={bankId} today={today} />
      <p className="text-[13px] text-ink-2">{N43_FALLBACK}</p>
    </>
  );
}

function RevokeHolded({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="flex shrink-0 flex-col items-start">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("¿Revocar el acceso a Holded? Borraremos la clave guardada. Los datos ya importados se mantienen.")) return;
          setBusy(true);
          const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/holded/revoke`, { method: "POST" }).catch(() => null);
          setBusy(false);
          if (!res?.ok) return setError(true);
          router.refresh();
        }}
        className="min-h-11 text-[13px] text-accent underline hover:text-accent-hover disabled:opacity-60"
      >
        Revocar acceso
      </button>
      {error && <span role="alert" className="text-xs text-high">No se pudo revocar. Inténtalo de nuevo.</span>}
    </span>
  );
}
