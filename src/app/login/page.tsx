import { Logo } from "@/components/Logo";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceder · credIA" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8">
        <div className="mb-6 flex flex-col gap-2">
          <Logo className="text-ink [&>span]:text-accent" />
          <h1 className="font-serif text-2xl font-semibold">Acceso para prestamistas</h1>
          <p className="text-sm text-ink-2">Te enviaremos un enlace de acceso por correo. No necesitas contraseña.</p>
        </div>
        {error && (
          <p role="alert" className="mb-4 rounded-[10px] bg-high-bg p-3 text-sm text-high">
            El enlace no es válido o ha caducado. Pide uno nuevo.
          </p>
        )}
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
