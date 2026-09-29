"use client";

/**
 * Drag-and-drop upload for one checklist item. Each file: ask the server for a signed upload URL,
 * send the bytes straight to Supabase Storage, then ask the server to check and record it.
 */
import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { RequirementKind } from "@/lib/cases/requirements";
import { checkDeclaredFile, UPLOAD_RULES } from "@/lib/borrower/upload-rules";
import { Input } from "@/components/ui/Input";

type FileState = { key: string; name: string; status: "uploading" | "done" | "duplicate" | "error"; message?: string };

interface Props {
  token: string;
  kind: RequirementKind;
  /** Norma 43: bank chip selected in the portal. */
  bank?: string;
  /** Freshness rule: the borrower types the certificate's issue date. */
  needsIssueDate?: boolean;
  today: string;
  label?: string;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, json: { error: "Sin conexión. Comprueba tu red e inténtalo de nuevo." } };
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export function UploadDropzone({ token, kind, bank, needsIssueDate = false, today, label }: Props) {
  const router = useRouter();
  // Not cleared on unmount: the item often collapses once done, and a later failure must still show up.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputId = useId();
  const dateId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [issuedOn, setIssuedOn] = useState("");
  const [files, setFiles] = useState<FileState[]>([]);
  const rule = UPLOAD_RULES[kind];
  const blocked = needsIssueDate && !issuedOn;
  const busy = files.some((f) => f.status === "uploading");

  const update = (key: string, patch: Partial<FileState>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  async function uploadOne(file: File, key: string): Promise<boolean> {
    const declared = checkDeclaredFile(kind, file.name, file.size);
    if (!declared.ok) {
      update(key, { status: "error", message: declared.message });
      return false;
    }
    const base = `/api/borrower/${encodeURIComponent(token)}`;
    const step1 = await postJson(`${base}/uploads`, { kind, filename: file.name, size: file.size });
    if (!step1.ok) {
      update(key, { status: "error", message: String(step1.json.error ?? "No hemos podido subir el fichero.") });
      return false;
    }
    const { path, uploadToken } = step1.json as { path: string; uploadToken: string };
    const { error } = await createClient().storage.from("case-files").uploadToSignedUrl(path, uploadToken, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      update(key, { status: "error", message: "La subida se ha interrumpido. Inténtalo de nuevo." });
      return false;
    }
    const step2 = await postJson(`${base}/documents`, { path, filename: file.name, bank, issuedOn: needsIssueDate ? issuedOn : undefined });
    if (!step2.ok) {
      update(key, { status: "error", message: String(step2.json.error ?? "No hemos podido guardar el fichero.") });
      return false;
    }
    update(key, step2.json.duplicate ? { status: "duplicate", message: "Ya lo habías subido" } : { status: "done" });
    return true;
  }

  async function handle(list: FileList | null) {
    if (!list?.length || blocked) return;
    const picked = rule.multiple ? Array.from(list) : [list[0]];
    const entries = picked.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
    setFiles((fs) => [...entries.map(({ file, key }) => ({ key, name: file.name, status: "uploading" as const })), ...fs]);
    const results = await Promise.all(entries.map(({ file, key }) => uploadOne(file, key)));
    if (inputRef.current) inputRef.current.value = "";
    if (results.some(Boolean)) {
      router.refresh();
      // Files are read in the background after upload; pick up "leído" or a fix message without a manual reload.
      for (const t of timers.current) clearTimeout(t);
      timers.current = [4_000, 12_000, 30_000, 60_000].map((ms) => setTimeout(() => router.refresh(), ms));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {needsIssueDate && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={dateId} className="text-sm font-medium">Fecha de emisión que aparece en el documento</label>
          <Input id={dateId} type="date" max={today} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className="max-w-[220px] font-mono" />
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!blocked) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handle(e.dataTransfer.files);
        }}
        aria-disabled={blocked || undefined}
        className={`relative flex flex-col items-center gap-2 rounded-panel px-6 py-8 text-center transition-colors duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          blocked ? "cursor-not-allowed bg-soft opacity-70" : dragOver ? "cursor-pointer bg-accent-ring" : "cursor-pointer bg-accent-tint hover:bg-accent-ring"
        }`}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-surface">
          {busy ? <Loader2 size={22} className="animate-spin text-accent" aria-hidden /> : <Upload size={22} strokeWidth={1.8} className="text-accent" aria-hidden />}
        </span>
        <span className="text-[15px] font-medium">
          {blocked ? (
            "Indica primero la fecha de emisión"
          ) : (
            <>
              {label ?? (rule.multiple ? "Arrastra los ficheros o " : "Arrastra el fichero o ")}
              <span className="text-accent underline">{rule.multiple ? "selecciónalos" : "selecciónalo"}</span>
            </>
          )}
        </span>
        <span className="text-[13px] text-muted">{rule.acceptLabel}</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={rule.multiple}
          disabled={blocked}
          accept={rule.extensions.map((e) => `.${e}`).join(",")}
          onChange={(e) => void handle(e.target.files)}
          className="absolute h-px w-px opacity-0"
        />
      </label>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[13px]" aria-live="polite">
          {files.map((f) => (
            <li key={f.key} className="flex items-start gap-2">
              {f.status === "uploading" && <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-muted" aria-hidden />}
              {(f.status === "done" || f.status === "duplicate") && <Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />}
              {f.status === "error" && <AlertCircle size={16} className="mt-0.5 shrink-0 text-high-dot" aria-hidden />}
              <span className="min-w-0">
                <span className="break-all font-medium">{f.name}</span>
                <span className={f.status === "error" ? "text-high" : "text-ink-2"}>
                  {" · "}
                  {f.status === "uploading" ? "subiendo…" : f.status === "done" ? "recibido" : f.message}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
