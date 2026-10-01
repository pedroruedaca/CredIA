"use client";

/**
 * Lender uploads in the case view (any document the analyst provides, "Lo subo yo"): signed URL straight to
 * Storage, then registered and read in the background. A drop zone for the empty state, a pill button to replace,
 * and drop handling for a whole section so dropping anywhere on it works.
 */
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { prepareLenderUpload, registerLenderUpload, type LenderUploadKind } from "@/app/casos/[id]/actions";
import { cx } from "@/components/ui/cx";
import { createClient } from "@/lib/supabase/browser";
import { CONTENT_TYPES, extensionOf, UPLOAD_RULES } from "@/lib/borrower/upload-rules";

export function useLenderUpload(caseId: string, kind: LenderUploadKind, badFormatMessage?: (name: string) => string) {
  const rule = UPLOAD_RULES[kind];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** One file, or several for documents that take several (Norma 43, Modelo 303…), uploaded one after another. */
  const upload = (input: File | File[]) =>
    start(async () => {
      setError(null);
      const files = (Array.isArray(input) ? input : [input]).slice(0, rule.multiple ? 24 : 1);
      let done = 0;
      for (const file of files) {
        if (!rule.extensions.includes(extensionOf(file.name))) {
          setError(badFormatMessage?.(file.name) ?? `«${file.name}» no tiene un formato válido para este documento. Formatos aceptados: ${rule.extensions.map((e) => `.${e}`).join(", ")}.`);
          break;
        }
        const prep = await prepareLenderUpload({ caseId, kind, filename: file.name, size: file.size });
        if (!prep.ok) {
          setError(prep.message);
          break;
        }
        const { error: upErr } = await createClient().storage.from("case-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || CONTENT_TYPES[extensionOf(file.name)] || "application/octet-stream" });
        if (upErr) {
          setError(`La subida de «${file.name}» se ha interrumpido. Inténtalo de nuevo.`);
          break;
        }
        const r = await registerLenderUpload({ caseId, path: prep.path, filename: file.name });
        if (!r.ok) {
          setError(r.message);
          break;
        }
        done++;
      }
      if (done === 0) return;
      router.refresh();
      // Documents are read in the background: pick up the result without a manual reload.
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
            const files = [...(e.dataTransfer.files ?? [])];
            if (files.length && !pending) upload(files);
          },
        }
      : {};
  return { upload, pending, error, dragOver, dropProps };
}

/** Accepted extensions and multiple selection for a document kind (PDF only when not given). */
export const fileAccept = (kind?: LenderUploadKind) => ({
  accept: kind ? UPLOAD_RULES[kind].extensions.map((e) => `.${e}`).join(",") : ".pdf,application/pdf",
  multiple: kind ? UPLOAD_RULES[kind].multiple : false,
});

export function FileInput({ id, disabled, onFile, kind }: { id: string; disabled: boolean; onFile: (f: File[]) => void; kind?: LenderUploadKind }) {
  const { accept, multiple } = fileAccept(kind);
  return (
    <input
      id={id}
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      className="sr-only"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        if (files.length) onFile(files);
        e.target.value = "";
      }}
    />
  );
}

/** Drop zone for a section with nothing uploaded yet (same look as the company's portal). */
export function DropZone({ inputId, pending, dragOver, onFile, title, pendingTitle, hint, kind }: { inputId: string; pending: boolean; dragOver: boolean; onFile: (f: File[]) => void; title: string; pendingTitle: string; hint: string; kind?: LenderUploadKind }) {
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
      <FileInput id={inputId} disabled={pending} onFile={onFile} kind={kind} />
    </label>
  );
}

/** Secondary pill to upload a replacement. */
export function UploadPill({ inputId, pending, onFile, label, kind }: { inputId: string; pending: boolean; onFile: (f: File[]) => void; label: string; kind?: LenderUploadKind }) {
  return (
    <label htmlFor={inputId} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-soft-control px-4 text-[13px] font-medium text-ink transition-colors hover:bg-track/70 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} strokeWidth={1.8} aria-hidden />}
      {pending ? "Subiendo…" : label}
      <FileInput id={inputId} disabled={pending} onFile={onFile} kind={kind} />
    </label>
  );
}
