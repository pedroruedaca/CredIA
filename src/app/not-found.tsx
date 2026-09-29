import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Logo />
        <h1 className="heading-page mt-4">No encontramos esta página</h1>
        <p className="text-[17px] leading-relaxed text-ink-2">Puede que el enlace esté incompleto o que ya no tengas acceso.</p>
        <Link href="/" className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium">Ir al inicio</Link>
      </div>
    </main>
  );
}
