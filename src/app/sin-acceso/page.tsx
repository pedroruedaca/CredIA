import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Sin acceso · credIA" };

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Logo />
        <h1 className="heading-page mt-4">Tu cuenta aún no está vinculada a un prestamista</h1>
        <p className="text-[17px] leading-relaxed text-ink-2">
          Has accedido correctamente, pero tu usuario no pertenece a ninguna entidad en credIA. Pide a la persona
          responsable de tu entidad que te dé acceso.
        </p>
        <form action="/auth/salir" method="post" className="mt-4">
          <Button type="submit" variant="secondary">Cerrar sesión</Button>
        </form>
      </div>
    </main>
  );
}
