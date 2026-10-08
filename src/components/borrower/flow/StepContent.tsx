"use client";

/**
 * Body of the current step (design/borrower-flow2.html): instructions, the upload or Holded tiles, and the
 * files received with what was read from them.
 */
import { AlertCircle, Check, FileSpreadsheet, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConnectHolded } from "@/components/ConnectHolded";
import { RichText } from "@/components/RichText";
import { buttonClass } from "@/components/ui/Button";
import { Pill, TogglePill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { BANKS, N43_FALLBACK } from "@/content/banks.es";
import { ITEM_COPY } from "@/content/borrower-portal.es";
import { freshnessWindow, type ChecklistFile, type ChecklistItem } from "@/lib/borrower/checklist";
import { UploadDropzone } from "../UploadDropzone";

/** Numbered instructions with mono "01 02 03". */
export function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-2.5 text-[15px] leading-normal">
      {steps.map((s, i) => (
        <li key={s} className="flex gap-3">
          <span aria-hidden className="w-5 shrink-0 font-mono text-faint">{String(i + 1).padStart(2, "0")}</span>
          <span><RichText text={s} /></span>
        </li>
      ))}
    </ol>
  );
}

/** Files received for this step, as pills: status icon, name, and the period read or the problem. */
export function FilePills({ files }: { files: ChecklistFile[] }) {
  if (files.length === 0) return null;
  return (
    <ul aria-label="Ficheros recibidos" className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id} className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-soft py-2 pl-2 pr-3.5 text-sm">
          <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full", f.tone === "problem" ? "bg-high-bg" : f.tone === "ok" ? "bg-ok-bg" : "bg-surface")}>
            {f.tone === "problem" ? (
              <AlertCircle size={14} strokeWidth={2.2} className="text-high-dot" aria-hidden />
            ) : f.tone === "ok" ? (
              <Check size={14} strokeWidth={3} className="text-ok" aria-hidden />
            ) : (
              <Loader2 size={14} className="animate-spin text-muted" aria-hidden />
            )}
          </span>
          <span className="truncate">{f.name}</span>
          <span className={f.tone === "problem" ? "text-high" : "text-muted"}>· {f.period ?? f.label}</span>
        </li>
      ))}
    </ul>
  );
}

function RevokeHolded({ link }: { link: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("¿Revocar el acceso a Holded? Borraremos la clave guardada. Los datos ya importados se mantienen.")) return;
          setBusy(true);
          const res = await fetch(`/api/borrower/${encodeURIComponent(link)}/holded/revoke`, { method: "POST" }).catch(() => null);
          setBusy(false);
          if (!res?.ok) return setError(true);
          router.refresh();
        }}
        className={buttonClass("link", "sm")}
      >
        Revocar acceso a Holded
      </button>
      {error && <span role="alert" className="flex items-center gap-2 text-[13px] text-ink-2"><Pill tone="high">Error</Pill>No se pudo revocar. Inténtalo de nuevo.</span>}
    </span>
  );
}

/** Accounting: two large tiles, "Conectar Holded" and "Subir sumas y saldos"; the chosen one opens below. */
function AccountingStep({ item, link, today }: { item: ChecklistItem; link: string; today: string }) {
  const connected = item.holded?.status === "synced";
  const [mode, setMode] = useState<"holded" | "upload" | null>(connected ? "holded" : item.files.length ? "upload" : null);
  const canRevoke = connected && item.holded?.mode === "refresh" && !item.holded.revoked_at;
  const tile = (value: "holded" | "upload", Icon: typeof Link2, title: string, sub: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={cx(
        "flex flex-col items-start gap-2 rounded-zone p-5 text-left transition-colors duration-150 ease-out",
        mode === value ? "bg-accent-tint ring-2 ring-accent" : "bg-soft hover:bg-soft-control",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-surface shadow-tile">
        <Icon size={18} strokeWidth={1.8} className="text-accent" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-sm text-ink-2">{sub}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {tile("holded", Link2, "Conectar Holded", connected ? "Conectado · solo lectura" : "Importamos tu contabilidad directamente. Solo lectura.")}
        {tile("upload", FileSpreadsheet, "Subir sumas y saldos", "Desde A3, Sage, ContaSol, Odoo… en Excel o CSV.")}
      </div>
      {mode === "holded" && (connected ? (
        <p className="flex flex-wrap items-center gap-3 text-[15px] text-ink-2">
          {item.summary ?? "Conectado con Holded."}
          {canRevoke && <RevokeHolded link={link} />}
        </p>
      ) : (
        <ConnectHolded link={link} />
      ))}
      {mode === "upload" && (
        <div className="flex flex-col gap-4">
          <Steps steps={ITEM_COPY.trial_balance.steps} />
          <UploadDropzone link={link} kind="trial_balance" today={today} />
        </div>
      )}
    </div>
  );
}

function Norma43Step({ link, today }: { link: string; today: string }) {
  const [bankId, setBankId] = useState(BANKS[0].id);
  const bank = BANKS.find((b) => b.id === bankId)!;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted" id="bank-label">¿Con qué banco trabajas?</div>
        <div role="group" aria-labelledby="bank-label" className="flex flex-wrap gap-2">
          {BANKS.map((b) => (
            <TogglePill key={b.id} pressed={b.id === bankId} onClick={() => setBankId(b.id)} className="min-h-11 px-[18px] text-sm sm:min-h-11">
              {b.name}
            </TogglePill>
          ))}
        </div>
      </div>
      <Steps steps={bank.steps} />
      <UploadDropzone link={link} kind="norma43" bank={bankId} today={today} />
      <p className="text-sm text-muted">{N43_FALLBACK}</p>
    </div>
  );
}

export function StepContent({ item, link, lenderName, today, readOnly }: { item: ChecklistItem; link: string; lenderName: string; today: string; readOnly: boolean }) {
  if (readOnly) {
    return <p className="text-[15px] text-muted">Aquí la empresa ve las instrucciones y el recuadro para subir el documento.</p>;
  }
  if (item.kind === "trial_balance") return <AccountingStep item={item} link={link} today={today} />;
  if (item.kind === "norma43") return <Norma43Step link={link} today={today} />;
  return (
    <div className="flex flex-col gap-5">
      <Steps steps={ITEM_COPY[item.kind].steps} />
      {item.maxAgeDays && <p className="text-[15px] text-ink-2">{lenderName} necesita que sea {freshnessWindow(item.maxAgeDays)}.</p>}
      <UploadDropzone link={link} kind={item.kind} needsIssueDate={item.maxAgeDays !== null} today={today} />
    </div>
  );
}
