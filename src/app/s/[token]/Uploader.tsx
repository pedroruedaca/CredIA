"use client";

/**
 * Drop zone for one checklist item. Upload in three steps so large files never pass through a serverless body:
 * ask for a signed URL → upload to Storage from the browser → ask the server to validate and record it.
 */
import { AlertTriangle, Check, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { RequirementKind } from "@/lib/cases/requirements";
import { createClient } from "@/lib/supabase/browser";

type FileState = { name: string; status: "uploading" | "done" | "rejected" | "error"; message?: string };

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export function Uploader({
  token,
  kind,
  accepts,
  multiple = false,
  needsIssueDate = false,
  bank = null,
  cta = "Arrastra el fichero o",
}: {
  token: string;
  kind: RequirementKind;
  accepts: string;
  multiple?: boolean;
  needsIssueDate?: boolean;
  bank?: string | null;
  cta?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const dateId = useId();
  const [issuedOn, setIssuedOn] = useState("");
  const [files, setFiles] = useState<FileState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const base = `/api/borrower/${encodeURIComponent(token)}/documents`;

  const update = (i: number, s: Partial<FileState>) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, ...s } : f)));

  async function uploadOne(file: File, i: number) {
    const step1 = await postJson(`${base}/upload-url`, { kind, name: file.name, size: file.size });
    if (!step1.ok) return update(i, { status: "error", message: String(step1.json.error ?? "No se pudo subir.") });

    const { error } = await createClient()
      .storage.from("case-files")
      .uploadToSignedUrl(String(step1.json.path), String(step1.json.token), file, { contentType: file.type || "application/octet-stream" });
    if (error) return update(i, { status: "error", message: "Se cortó la subida. Comprueba tu conexión y vuelve a intentarlo." });

    const step3 = await postJson(`${base}/complete`, {
      kind,
      path: step1.json.path,
      name: file.name,
      issuedOn: needsIssueDate ? issuedOn : undefined,
      bank: bank ?? undefined,
    });
    if (!step3.ok) return update(i, { status: "error", message: String(step3.json.error ?? "No se pudo guardar.") });
    if (step3.json.status === "rejected") return update(i, { status: "rejected", message: String(step3.json.message ?? "") });
    update(i, { status: "done", message: step3.json.duplicate ? "Ya lo teníamos: no hace falta subirlo otra vez." : undefined });
  }

  async function handle(list: File[]) {
    if (list.length === 0 || busy) return;
    if (needsIssueDate && !issuedOn) {
      setFormError("Indica primero la fecha de emisión que aparece en el documento.");
      return;
    }
    setFormError(null);
    const picked = multiple ? list : [list[0]];
    const offset = files.length;
    setFiles((prev) => [...prev, ...picked.map((f) => ({ name: f.name, status: "uploading" as const }))]);
    setBusy(true);
    try {
      // Sequential keeps progress readable and avoids hammering Storage from slow connections.
      for (const [j, f] of picked.entries()) {
        try {
          await uploadOne(f, offset + j);
        } catch {
          update(offset + j, { status: "error", message: "No se pudo subir. Vuelve a intentarlo." });
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {needsIssueDate && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={dateId} className="text-sm font-medium">Fecha de emisión</label>
          <input
            id={dateId}
            type="date"
            value={issuedOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setIssuedOn(e.target.value)}
            className="h-11 w-full max-w-[220px] rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm"
          />
          <p className="text-xs text-muted">La que aparece en el propio documento.</p>
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(Array.from(e.dataTransfer.files));
        }}
        className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-block border-[1.5px] border-dashed p-6 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          dragging ? "border-accent bg-accent-tint" : "border-[#9FA3AA] bg-surface"
        }`}
      >
        {busy ? <Loader2 size={24} className="animate-spin text-accent" aria-hidden /> : <Upload size={24} className="text-accent" aria-hidden />}
        <span className="text-sm font-medium">
          {busy ? "Subiendo…" : <>{cta} <span className="text-accent underline">selecciónalo{multiple ? "s" : ""}</span></>}
        </span>
        <span className="text-xs text-muted">{accepts} · máximo 20 MB</span>
        <input
          id={inputId}
          type="file"
          multiple={multiple}
          disabled={busy}
          onChange={(e) => {
            const picked = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void handle(picked);
          }}
          className="absolute size-px opacity-0"
        />
      </label>

      {formError && <p role="alert" className="text-sm text-warn">{formError}</p>}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[13px]" aria-live="polite">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-start gap-2">
              {f.status === "uploading" && <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-muted" aria-hidden />}
              {f.status === "done" && <Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />}
              {(f.status === "rejected" || f.status === "error") && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-icon" aria-hidden />}
              <span className="min-w-0">
                <span className="font-medium break-all">{f.name}</span>
                <span className={f.status === "done" || f.status === "uploading" ? "text-ink-2" : "text-warn"}>
                  {" · "}
                  {f.status === "uploading" ? "subiendo…" : f.status === "done" ? (f.message ?? "recibido") : f.message}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
