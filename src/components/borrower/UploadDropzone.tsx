"use client";

/**
 * Drag-and-drop upload for one checklist item. Each file: ask the server for a signed upload URL,
 * send the bytes straight to Supabase Storage, then ask the server to check and record it.
 */
import { AlertCircle, Loader2, Upload } from "lucide-react";
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
  /** Freshness rule: the borrower may type the issue date (optional; processing reads it from the document). */
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
    const step2 = await postJson(`${base}/documents`, { path, filename: file.name, bank, issuedOn: needsIssueDate && issuedOn ? issuedOn : undefined });
    if (!step2.ok) {
      update(key, { status: "error", message: String(step2.json.error ?? "No hemos podido guardar el fichero.") });
      return false;
    }
    update(key, step2.json.duplicate ? { status: "duplicate", message: "Ya lo habías subido" } : { status: "done" });
    return true;
  }

  async function handle(list: FileList | null) {
    if (!list?.length) return;
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
          <label htmlFor={dateId} className="text-sm font-medium">
            Fecha de emisión que aparece en el documento <span className="font-normal text-muted">(opcional: la leemos del documento)</span>
          </label>
          <Input id={dateId} type="date" max={today} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className="max-w-[220px] font-mono" />
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handle(e.dataTransfer.files);
        }}
        className={`relative flex items-center gap-4 rounded-zone px-5 py-4 transition-colors duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:px-6 sm:py-5 ${
          dragOver ? "cursor-pointer bg-accent-ring" : "cursor-pointer bg-accent-tint hover:bg-accent-ring"
        }`}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-tile">
          {busy ? <Loader2 size={20} className="animate-spin text-accent" aria-hidden /> : <Upload size={20} strokeWidth={2} className="text-accent" aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {label ?? (rule.multiple ? "Suelta aquí tus ficheros" : "Suelta aquí el fichero")}
          </span>
          <span className="text-sm text-ink-2">
            o <span className="text-accent underline underline-offset-[3px]">{rule.multiple ? "búscalos en tu equipo" : "búscalo en tu equipo"}</span> · {rule.acceptLabel}
          </span>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={rule.multiple}
          accept={rule.extensions.map((e) => `.${e}`).join(",")}
          onChange={(e) => void handle(e.target.files)}
          className="absolute h-px w-px opacity-0"
        />
      </label>

      {/* In-flight and failed uploads. Received files come back from the server as FilePills, with what was read. */}
      {files.some((f) => f.status === "uploading" || f.status === "error") && (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {files
            .filter((f) => f.status === "uploading" || f.status === "error")
            .map((f) => (
              <li key={f.key} className="inline-flex max-w-full items-center gap-2.5 rounded-full bg-soft py-2 pl-2 pr-3.5 text-sm">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${f.status === "error" ? "bg-high-bg" : "bg-surface"}`}>
                  {f.status === "uploading" ? <Loader2 size={14} className="animate-spin text-muted" aria-hidden /> : <AlertCircle size={14} strokeWidth={2.2} className="text-high-dot" aria-hidden />}
                </span>
                <span className="truncate">{f.name}</span>
                <span className={f.status === "error" ? "text-high" : "text-muted"}>· {f.status === "uploading" ? "subiendo…" : f.message}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
