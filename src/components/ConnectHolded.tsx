"use client";

/**
 * Borrower-facing "Conectar Holded" card, shown next to "Subir sumas y saldos" on the magic-link page.
 * Spanish copy: the borrower is a Spanish SME. Permission labels must match Holded's UI (verify).
 */
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; hint?: string; periods: { kind: string; start: string; end: string }[] }
  | { kind: "error"; message: string };

export function ConnectHolded({ token, allowRefresh = false }: { token: string; allowRefresh?: boolean }) {
  const router = useRouter();
  const keyId = useId();
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    const res = await fetch(`/api/borrower/${encodeURIComponent(token)}/holded`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, consent, mode: refresh ? "refresh" : "one_time" }),
    });
    const json = await res.json().catch(() => ({}));
    setApiKey(""); // never keep the key in component state after submit
    if (!res.ok) return setState({ kind: "error", message: json.error ?? "Error inesperado." });
    setState({ kind: "done", hint: json.hint, periods: json.periods ?? [] });
    router.refresh();
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="rounded-block bg-ok-bg p-4 text-sm text-ok">
        <p className="font-medium">Datos contables importados de Holded.</p>
        <ul className="mt-2 list-disc pl-5">
          {state.periods.map((p) => (
            <li key={p.kind}>
              {p.kind === "closed_fy" ? "Último ejercicio cerrado" : "Ejercicio en curso"}: <span className="font-mono">{p.start} → {p.end}</span>
            </li>
          ))}
        </ul>
        {state.hint && <p className="mt-3">{state.hint}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-block border border-line bg-surface p-5 text-sm">
      <div>
        <h3 className="text-[15px] font-semibold">Conectar Holded</h3>
        <p className="mt-1 text-ink-2">Importamos tu contabilidad directamente, sin exportar ficheros. Solo lectura.</p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-[#2E3138]">
        <li>En Holded, ve a <b>Configuración → Desarrolladores → API</b> y pulsa <b>Añadir token de API</b>.</li>
        <li>Activa solo estos permisos de lectura: <b>Contabilidad → Plan de cuentas</b> y <b>Contabilidad → Libro diario</b>.</li>
        <li>Copia la clave y pégala aquí.</li>
      </ol>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={keyId} className="font-medium">Clave de API de Holded</label>
        <input
          id={keyId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-mono"
        />
      </div>

      <label className="flex items-start gap-2.5 text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-accent" />
        <span>Autorizo a credIA a leer mi plan de cuentas y libro diario de Holded para preparar la documentación financiera solicitada por el prestamista.</span>
      </label>

      {allowRefresh && (
        <label className="flex items-start gap-2.5 text-ink-2">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} className="mt-1 size-4 accent-accent" />
          <span>Permitir actualizaciones posteriores (la clave se guarda cifrada; puedes revocarla en cualquier momento).</span>
        </label>
      )}
      {!refresh && <p className="text-xs text-muted">La clave se usa una sola vez y no se guarda. Después puedes eliminarla en Holded.</p>}

      {state.kind === "error" && <p role="alert" className="rounded-block bg-high-bg p-3 text-high">{state.message}</p>}

      <button
        type="submit"
        disabled={!apiKey || !consent || state.kind === "submitting"}
        className="h-11 self-start rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {state.kind === "submitting" ? "Importando… puede tardar un par de minutos" : "Conectar e importar"}
      </button>
    </form>
  );
}
