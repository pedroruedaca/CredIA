"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  token: string;
  allRequiredDone: boolean;
  missingCount: number;
  submittedAt: string | null;
  submittedLabel: string | null; // formatted on the server
  lenderName: string;
}

export function SubmitBar({ token, allRequiredDone, missingCount, submittedAt, submittedLabel, lenderName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submittedAt) {
    return (
      <div role="status" className="rounded-[10px] bg-ok-bg p-4 text-sm text-ok">
        <p className="font-semibold">Documentación enviada el {submittedLabel}.</p>
        <p className="mt-0.5">{lenderName} ya puede revisarla. Si te piden algo más, aparecerá en esta misma lista.</p>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/submit`, { method: "POST" }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(json.error ?? "No hemos podido enviar la documentación. Inténtalo de nuevo.");
    router.refresh();
  }

  const disabled = !allRequiredDone || busy;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          aria-describedby="submit-hint"
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-[22px] text-[15px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-disabled disabled:text-on-disabled"
        >
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
          Enviar documentación
        </button>
        <span id="submit-hint" className="text-[13px] text-ink-2">
          {allRequiredDone
            ? `Todo listo. Al enviarla, ${lenderName} podrá revisarla.`
            : `Falta${missingCount === 1 ? "" : "n"} ${missingCount} documento${missingCount === 1 ? "" : "s"}. Tu progreso se guarda automáticamente.`}
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-high">{error}</p>}
    </div>
  );
}
