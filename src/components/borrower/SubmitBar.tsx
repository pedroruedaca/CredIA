"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

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
      <div role="status" className="flex flex-col items-start gap-2 text-[15px] text-ink-2">
        <Pill tone="ok">Documentación enviada el {submittedLabel}</Pill>
        <p>{lenderName} ya puede revisarla. Si te piden algo más, aparecerá en esta misma lista.</p>
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
        <Button onClick={submit} disabled={disabled} aria-describedby="submit-hint">
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden />}
          Enviar documentación
        </Button>
        <span id="submit-hint" className="text-[13px] text-ink-2">
          {allRequiredDone
            ? `Todo listo. Al enviarla, ${lenderName} podrá revisarla.`
            : `Falta${missingCount === 1 ? "" : "n"} ${missingCount} documento${missingCount === 1 ? "" : "s"}. Tu progreso se guarda automáticamente.`}
        </span>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-ink-2"><Pill tone="high">Error</Pill>{error}</p>}
    </div>
  );
}
