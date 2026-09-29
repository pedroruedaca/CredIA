import { Logo } from "@/components/Logo";
import { Pill } from "@/components/ui/Pill";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceder · credIA" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Logo />
          <h1 className="heading-page mt-4">Acceso para prestamistas</h1>
          <p className="text-[17px] text-ink-2">Te enviaremos un enlace de acceso por correo. No necesitas contraseña.</p>
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-ink-2">
            <Pill tone="high">Enlace no válido</Pill> Ha caducado o ya se usó. Pide uno nuevo.
          </p>
        )}
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
