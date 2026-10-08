"use client";

/**
 * Borrower-facing "Conectar Holded" card, shown next to "Subir sumas y saldos" on the magic-link page.
 * Spanish copy: the borrower is a Spanish SME. Permission labels must match Holded's UI (verify).
 */
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; hint?: string }
  | { kind: "error"; message: string };

export function ConnectHolded({ link, allowRefresh = false }: { link: string; allowRefresh?: boolean }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    const res = await fetch(`/api/borrower/${encodeURIComponent(link)}/holded`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, consent, mode: refresh ? "refresh" : "one_time" }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setApiKey(""); // never keep the key in component state after submit
    if (!res?.ok) return setState({ kind: "error", message: json.error ?? "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo." });
    setState({ kind: "done", hint: json.hint });
    router.refresh();
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="flex flex-col items-start gap-2 text-sm text-ink-2">
        <Pill tone="ok">Datos contables importados de Holded</Pill>
        {state.hint && <p>{state.hint}</p>}
      </div>
    );
  }

  const busy = state.kind === "submitting";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-panel bg-soft p-6 text-sm">
      <div>
        <h3 className="heading-section">Conectar Holded</h3>
        <p className="mt-0.5 text-ink-2">Importamos tu contabilidad directamente, sin exportar ficheros. Solo lectura.</p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-ink-2">
        <li>En Holded, ve a <b>Configuración → Desarrolladores → API</b> y pulsa <b>Añadir token de API</b>.</li>
        <li>Activa solo estos permisos de lectura: <b>Contabilidad → Plan de cuentas</b> y <b>Contabilidad → Libro diario</b>.</li>
        <li>Copia la clave y pégala aquí.</li>
      </ol>

      <label htmlFor="holded-key" className="sr-only">Clave de API de Holded</label>
      <Input
        id="holded-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Clave de API de Holded"
        className="bg-surface font-mono text-sm"
      />

      <label className="flex items-start gap-2.5 text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
        <span>Autorizo a credIA a leer mi plan de cuentas y libro diario de Holded para preparar la documentación financiera solicitada por el prestamista.</span>
      </label>

      {allowRefresh && (
        <label className="flex items-start gap-2.5 text-ink-2">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
          <span>Permitir actualizaciones posteriores (la clave se guarda cifrada; puedes revocarla en cualquier momento).</span>
        </label>
      )}
      {!refresh && <p className="text-[13px] text-muted">La clave se usa una sola vez y no se guarda. Después puedes eliminarla en Holded.</p>}

      {state.kind === "error" && <p role="alert" className="flex items-start gap-2 text-ink-2"><Pill tone="high">Error</Pill>{state.message}</p>}

      <Button type="submit" disabled={!apiKey || !consent || busy} className="self-start">
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {busy ? "Importando… puede tardar un par de minutos" : "Conectar e importar"}
      </Button>
    </form>
  );
}
