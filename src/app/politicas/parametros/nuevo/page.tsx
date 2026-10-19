import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLender } from "@/lib/lender";
import { ParameterForm } from "../ParameterForm";

export const metadata = { title: "Nuevo parámetro · credIA" };

export default async function NuevoParametroPage() {
  const lender = await requireLender();
  if (lender.role === "viewer") redirect("/politicas/parametros");
  return (
    <main className="w-full max-w-3xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/politicas">Políticas</Link> / <Link href="/politicas/parametros">Parámetros</Link> / Nuevo</div>
        <h1 className="heading-page">Nuevo parámetro</h1>
        <p className="text-[15px] text-ink-2">Después lo eliges como umbral en los criterios de una política: «Ingresos ≥ 4 × Importe solicitado».</p>
      </div>
      <ParameterForm id={null} initial={{}} canEdit />
    </main>
  );
}
