/**
 * Shown instead of the app when required settings are missing on a preview deployment or locally (never in
 * production): names the variables, never their values, and says where to add them.
 */
import { Pill } from "@/components/ui/Pill";

export function ConfigProblem({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-10">
      <div role="alert" className="flex flex-wrap items-center gap-3 text-[15px] text-ink-2">
        <Pill tone="high">Error</Pill>
        <span>Falta configuración en este entorno:</span>
        {missing.map((name) => <code key={name} className="font-mono text-[13px] text-ink">{name}</code>)}
      </div>
      <p className="text-[15px] text-ink-2">
        Añádela en Vercel → Settings → Environment Variables, marcando este entorno (Preview o Development), y vuelve a desplegar.
        En local, ponla en <code className="font-mono text-[13px] text-ink">.env.local</code>.
      </p>
    </main>
  );
}
