"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { ConnectHolded } from "@/components/ConnectHolded";
import { BANKS, N43_FALLBACK } from "@/content/banks.es";
import { CHECKLIST_COPY } from "@/content/borrower.es";
import type { ChecklistItem } from "@/lib/borrower/checklist";
import { formatDate } from "@/lib/format";
import { DelegateDialog } from "./DelegateDialog";
import { Uploader } from "./Uploader";

/** Renders "**bold**" segments from content files. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}

function StateIcon({ item, expanded }: { item: ChecklistItem; expanded: boolean }) {
  const box = "flex size-7 shrink-0 items-center justify-center rounded-full";
  if (item.state === "done") return <div className={`${box} bg-ok-bg`}><Check size={16} strokeWidth={2.5} className="text-ok" aria-hidden /></div>;
  if (item.state === "attention") return <div className={`${box} bg-warn-bg text-sm font-bold text-warn-icon`} aria-hidden>!</div>;
  if (item.state === "in_progress") return <div className={`${box} bg-info-bg`}><Loader2 size={16} className="animate-spin text-info-icon" aria-hidden /></div>;
  return (
    <div className={`${box} border-2 text-[13px] font-semibold ${expanded ? "border-accent text-accent" : "border-line-strong text-muted"}`} aria-hidden>
      {item.step}
    </div>
  );
}

const STATE_LABEL: Record<ChecklistItem["state"], string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completado",
  attention: "Revisar",
};

function summary(item: ChecklistItem): string {
  const copy = CHECKLIST_COPY[item.kind];
  if (item.state === "attention") return item.message ?? copy.description;
  if (item.state === "in_progress") return "Importando datos de Holded…";
  if (item.state !== "done") return copy.description;
  if (item.holded?.status === "synced" && item.accepted.length === 0) {
    return `Conectado con Holded · datos importados el ${formatDate(item.holded.last_sync_at)}`;
  }
  if (item.accepted.length > 1) return `${item.accepted.length} ficheros recibidos`;
  const d = item.accepted[0];
  if (d.issued_on && item.maxAgeDays) return `Emitido el ${formatDate(d.issued_on)} · vigente`;
  return `${d.original_name ?? "Fichero"} · ${d.status === "parsed" ? "leído correctamente" : "recibido"}`;
}

export function ChecklistRow({
  item,
  expanded,
  onToggle,
  token,
  lenderName,
  readOnly,
  canDelegate,
}: {
  item: ChecklistItem;
  expanded: boolean;
  onToggle: () => void;
  token: string;
  lenderName: string;
  readOnly: boolean;
  canDelegate: boolean;
}) {
  const copy = CHECKLIST_COPY[item.kind];
  const panelId = `panel-${item.kind}`;
  const title = (
    <>
      {copy.title}
      {!item.required && <span className="ml-2 text-xs font-normal text-muted">Opcional</span>}
    </>
  );

  return (
    <li id={`paso-${item.kind}`} className={`border-b border-line-row last:border-0 ${expanded ? "bg-surface-subtle" : ""}`}>
      <div className={`relative flex items-center gap-4 px-[22px] py-[18px] ${item.state === "attention" ? "items-start" : ""}`}>
        <StateIcon item={item} expanded={expanded} />
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h3 className="text-[15px] font-semibold">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={onToggle}
              className="text-left after:absolute after:inset-0 hover:underline"
            >
              {title}
            </button>
          </h3>
          <p className={`text-[13px] ${item.state === "attention" ? "text-warn" : "text-ink-2"}`}>{summary(item)}</p>
        </div>
        {item.state !== "done" && <span className="sr-only sm:hidden">{STATE_LABEL[item.state]}</span>}
        {item.state === "attention" && !readOnly && !expanded ? (
          <button type="button" onClick={onToggle} className="relative z-10 hidden h-10 shrink-0 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium sm:block">
            Subir uno nuevo
          </button>
        ) : item.state !== "done" ? (
          <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-block ${item.state === "attention" ? "bg-warn-bg text-warn" : "bg-info-bg text-info"}`}>
            {STATE_LABEL[item.state]}
          </span>
        ) : (
          <span className="sr-only">{STATE_LABEL.done}</span>
        )}
      </div>

      {expanded && (
        <div id={panelId} className="flex flex-col gap-3.5 pb-6 pl-[66px] pr-[22px]">
          {readOnly ? (
            <p className="text-[13px] text-ink-2">{copy.description}</p>
          ) : (
            <ItemBody item={item} token={token} lenderName={lenderName} canDelegate={canDelegate} />
          )}
        </div>
      )}
    </li>
  );
}

function ItemBody({ item, token, lenderName, canDelegate }: { item: ChecklistItem; token: string; lenderName: string; canDelegate: boolean }) {
  const copy = CHECKLIST_COPY[item.kind];
  const delegate = canDelegate ? <DelegateDialog token={token} lenderName={lenderName} /> : null;
  const received = item.accepted.length > 0 && (
    <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
      {item.accepted.map((d) => (
        <li key={d.id} className="flex items-center gap-2">
          <Check size={14} className="shrink-0 text-ok" aria-hidden />
          <span className="break-all">{d.original_name ?? "Fichero"}</span>
        </li>
      ))}
    </ul>
  );

  if (item.kind === "trial_balance") return <AccountingBody item={item} token={token} delegate={delegate} received={received} />;
  if (item.kind === "norma43") return <Norma43Body item={item} token={token} delegate={delegate} received={received} />;

  return (
    <>
      <p className="text-sm text-ink-2">{copy.description}</p>
      {received}
      <Uploader
        token={token}
        kind={item.kind}
        accepts={copy.accepts}
        needsIssueDate={!!item.maxAgeDays}
        cta={item.state === "done" ? "Para sustituirlo, arrastra otro o" : "Arrastra el fichero o"}
      />
      {item.maxAgeDays && (
        <p className="text-xs text-muted">{lenderName} acepta documentos con una antigüedad máxima de {item.maxAgeDays} días.</p>
      )}
      {delegate}
    </>
  );
}

function AccountingBody({ item, token, delegate, received }: { item: ChecklistItem; token: string; delegate: React.ReactNode; received: React.ReactNode }) {
  const [path, setPath] = useState<"holded" | "upload">("holded");
  const synced = item.holded?.status === "synced";
  const tab = (value: typeof path, label: string) => (
    <button
      type="button"
      aria-pressed={path === value}
      onClick={() => setPath(value)}
      className={`h-11 rounded-full border px-4 text-[13px] ${path === value ? "border-accent bg-accent font-medium text-white" : "border-line-strong bg-surface text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <p className="text-sm text-ink-2">{CHECKLIST_COPY.trial_balance.description}</p>
      {received}
      {synced && <p className="text-[13px] text-ok">Ya tenemos tu contabilidad de Holded. Solo hace falta volver a conectar si quieres actualizarla.</p>}
      <div role="group" aria-label="Cómo aportar la contabilidad" className="flex flex-wrap gap-2">
        {tab("holded", "Conectar Holded")}
        {tab("upload", "Subir sumas y saldos")}
      </div>
      <div>
        {path === "holded" ? (
          <ConnectHolded token={token} />
        ) : (
          <Uploader token={token} kind="trial_balance" accepts={CHECKLIST_COPY.trial_balance.accepts} multiple cta="Arrastra los ficheros o" />
        )}
      </div>
      {delegate}
    </>
  );
}

function Norma43Body({ item, token, delegate, received }: { item: ChecklistItem; token: string; delegate: React.ReactNode; received: React.ReactNode }) {
  const [bankId, setBankId] = useState(BANKS[0].id);
  const bank = BANKS.find((b) => b.id === bankId) ?? BANKS[0];

  return (
    <>
      <div role="group" aria-label="Tu banco" className="flex flex-wrap gap-2">
        {BANKS.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={b.id === bankId}
            onClick={() => setBankId(b.id)}
            className={`h-11 rounded-full border px-3.5 text-[13px] ${b.id === bankId ? "border-accent bg-accent font-medium text-white" : "border-line-strong bg-surface text-ink"}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <ol className="list-decimal pl-5 text-sm leading-relaxed text-[#2E3138]">
        {bank.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}
      </ol>
      {received}
      <Uploader
        token={token}
        kind="norma43"
        accepts={CHECKLIST_COPY.norma43.accepts}
        multiple
        bank={bank.id}
        cta={item.accepted.length ? "Añade más ficheros: arrástralos o" : "Arrastra los ficheros o"}
      />
      <p className="text-xs text-muted">{N43_FALLBACK}</p>
      {delegate}
    </>
  );
}
