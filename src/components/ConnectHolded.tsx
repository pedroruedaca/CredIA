"use client";

/**
 * Borrower-facing "Conectar Holded" card, shown next to "Subir sumas y saldos" on the magic-link page.
 * Spanish copy: the borrower is a Spanish SME. Permission labels must match Holded's UI (verify).
 */
import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; hint?: string; periods: { kind: string; start: string; end: string }[] }
  | { kind: "error"; message: string };

export function ConnectHolded({ token, allowRefresh = false }: { token: string; allowRefresh?: boolean }) {
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
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-medium">Datos contables importados de Holded.</p>
        <ul className="mt-2 list-disc pl-5">
          {state.periods.map((p) => (
            <li key={p.kind}>{p.kind === "closed_fy" ? "Último ejercicio cerrado" : "Ejercicio en curso"}: {p.start} → {p.end}</li>
          ))}
        </ul>
        {state.hint && <p className="mt-3">{state.hint}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-sm">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Conectar Holded</h3>
        <p className="mt-1 text-slate-600">Importamos tu contabilidad directamente, sin exportar ficheros. Solo lectura.</p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-slate-700">
        <li>En Holded, ve a <b>Configuración → Desarrolladores → API</b> y pulsa <b>Añadir token de API</b>.</li>
        <li>Activa solo estos permisos de lectura: <b>Contabilidad → Plan de cuentas</b> y <b>Contabilidad → Libro diario</b>.</li>
        <li>Copia la clave y pégala aquí.</li>
      </ol>

      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Clave de API de Holded"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono focus:border-slate-900 focus:outline-none"
      />

      <label className="flex items-start gap-2 text-slate-700">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>Autorizo a credIA a leer mi plan de cuentas y libro diario de Holded para preparar la documentación financiera solicitada por el prestamista.</span>
      </label>

      {allowRefresh && (
        <label className="flex items-start gap-2 text-slate-700">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} className="mt-0.5" />
          <span>Permitir actualizaciones posteriores (la clave se guarda cifrada; puedes revocarla en Holded en cualquier momento).</span>
        </label>
      )}
      {!refresh && <p className="text-xs text-slate-500">La clave se usa una sola vez y no se guarda. Después puedes eliminarla en Holded.</p>}

      {state.kind === "error" && <p className="rounded-lg bg-red-50 p-3 text-red-800">{state.message}</p>}

      <button
        type="submit"
        disabled={!apiKey || !consent || state.kind === "submitting"}
        className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {state.kind === "submitting" ? "Importando…" : "Conectar e importar"}
      </button>
    </form>
  );
}
