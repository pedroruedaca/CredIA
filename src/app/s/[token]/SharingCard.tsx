"use client";

/** "Qué compartimos y con quién": recipient, purpose, Holded access, and consent withdrawal. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChecklistHolded } from "@/lib/borrower/checklist";

function holdedText(h: ChecklistHolded | null): string {
  if (!h || h.status !== "synced") return "No conectado.";
  if (h.mode === "one_time") return "Acceso de solo lectura. La clave se usó una vez y no se ha guardado.";
  if (h.revoked_at) return "Acceso revocado. Los datos ya importados se mantienen.";
  return "Acceso de solo lectura. La clave se guarda cifrada para actualizar los datos.";
}

export function SharingCard({
  token,
  lenderName,
  holded,
  canWithdraw,
  withdrawn,
}: {
  token: string;
  lenderName: string;
  holded: ChecklistHolded | null;
  canWithdraw: boolean;
  withdrawn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedKey = holded?.status === "synced" && holded.mode === "refresh" && !holded.revoked_at;

  async function call(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/${path}`, { method });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "No se pudo completar.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-[22px] py-5 text-sm leading-normal">
      <h2 className="text-base font-semibold">Qué compartimos y con quién</h2>
      <div>
        <div className="text-[13px] text-muted">Destinatario</div>
        <div>Solo {lenderName}</div>
      </div>
      <div>
        <div className="text-[13px] text-muted">Para qué</div>
        <div>Analizar esta solicitud de financiación</div>
      </div>
      <div>
        <div className="text-[13px] text-muted">Holded</div>
        <div>{holdedText(holded)}</div>
        {storedKey && !withdrawn && (
          <button type="button" disabled={busy} onClick={() => call("holded/revoke", "POST")} className="min-h-11 text-[13px] text-accent underline hover:text-accent-hover">
            Revocar acceso a Holded
          </button>
        )}
      </div>
      {error && <p role="alert" className="rounded-block bg-high-bg p-3 text-[13px] text-high">{error}</p>}
      {withdrawn ? (
        <p className="rounded-block bg-line-row p-3 text-[13px] text-ink-2">Has retirado el consentimiento. No se compartirá nada más.</p>
      ) : (
        canWithdraw && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`¿Retirar el consentimiento? ${lenderName} dejará de recibir documentación y no podrás seguir subiendo ficheros con este enlace.`)) {
                void call("consent", "DELETE");
              }
            }}
            className="min-h-11 self-start text-[13px] text-accent underline hover:text-accent-hover"
          >
            Retirar consentimiento
          </button>
        )
      )}
    </section>
  );
}
