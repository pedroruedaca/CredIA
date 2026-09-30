"use client";

/**
 * Lender uploads in the case view (informe de solvencia, cuentas anuales obtained by CIF): signed URL straight to
 * Storage, then registered and read in the background. A drop zone for the empty state, a pill button to replace,
 * and drop handling for a whole section so dropping anywhere on it works.
 */
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { prepareLenderUpload, registerLenderUpload, type LenderUploadKind } from "@/app/casos/[id]/actions";
import { cx } from "@/components/ui/cx";
import { createClient } from "@/lib/supabase/browser";

export function useLenderUpload(caseId: string, kind: LenderUploadKind, notPdfMessage: (name: string) => string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const upload = (file: File) =>
    start(async () => {
      setError(null);
      if (!/\.pdf$/i.test(file.name)) return setError(notPdfMessage(file.name));
      const prep = await prepareLenderUpload({ caseId, kind, filename: file.name, size: file.size });
      if (!prep.ok) return setError(prep.message);
      const { error: upErr } = await createClient().storage.from("case-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "application/pdf" });
      if (upErr) return setError("La subida se ha interrumpido. Inténtalo de nuevo.");
      const r = await registerLenderUpload({ caseId, path: prep.path, filename: file.name });
      if (!r.ok) return setError(r.message);
      router.refresh();
      // The PDF is read in the background: pick up the result without a manual reload.
      for (const ms of [5_000, 15_000, 40_000]) setTimeout(() => router.refresh(), ms);
    });
  const dropProps = (enabled: boolean) =>
    enabled
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !pending) upload(f);
          },
        }
      : {};
  return { upload, pending, error, dragOver, dropProps };
}

export function FileInput({ id, disabled, onFile }: { id: string; disabled: boolean; onFile: (f: File) => void }) {
  return (
    <input
      id={id}
      type="file"
      accept=".pdf,application/pdf"
      disabled={disabled}
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }}
    />
  );
}

/** Drop zone for a section with nothing uploaded yet (same look as the company's portal). */
export function DropZone({ inputId, pending, dragOver, onFile, title, pendingTitle, hint }: { inputId: string; pending: boolean; dragOver: boolean; onFile: (f: File) => void; title: string; pendingTitle: string; hint: string }) {
  return (
    <label
      htmlFor={inputId}
      className={cx(
        "relative flex cursor-pointer items-center gap-4 rounded-zone px-5 py-4 transition-colors duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:px-6 sm:py-5",
        dragOver ? "bg-accent-ring" : "bg-accent-tint hover:bg-accent-ring",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-tile">
        {pending ? <Loader2 size={20} className="animate-spin text-accent" aria-hidden /> : <Upload size={20} strokeWidth={2} className="text-accent" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{pending ? pendingTitle : title}</span>
        <span className="text-sm text-ink-2">
          o <span className="text-accent underline underline-offset-[3px]">búscalo en tu equipo</span> · {hint}
        </span>
      </span>
      <FileInput id={inputId} disabled={pending} onFile={onFile} />
    </label>
  );
}

/** Secondary pill to upload a replacement. */
export function UploadPill({ inputId, pending, onFile, label }: { inputId: string; pending: boolean; onFile: (f: File) => void; label: string }) {
  return (
    <label htmlFor={inputId} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-soft-control px-4 text-[13px] font-medium text-ink transition-colors hover:bg-track/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} strokeWidth={1.8} aria-hidden />}
      {pending ? "Subiendo…" : label}
      <FileInput id={inputId} disabled={pending} onFile={onFile} />
    </label>
  );
}
