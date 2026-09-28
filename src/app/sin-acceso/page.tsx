import { Logo } from "@/components/Logo";

export const metadata = { title: "Sin acceso · credIA" };

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8">
        <Logo className="text-ink [&>span]:text-accent" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Tu cuenta aún no está vinculada a un prestamista</h1>
        <p className="mt-2 text-sm text-ink-2">
          Has accedido correctamente, pero tu usuario no pertenece a ninguna entidad en credIA. Pide a la persona
          responsable de tu entidad que te dé acceso.
        </p>
        <form action="/auth/salir" method="post" className="mt-6">
          <button type="submit" className="h-11 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
