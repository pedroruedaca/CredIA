import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLender } from "@/lib/lender";
import { listParameters } from "@/lib/policies/parameter-store";
import { createClient } from "@/lib/supabase/server";
import { PolicyForm } from "../PolicyForm";

export const metadata = { title: "Nueva política · credIA" };

export default async function NuevaPoliticaPage() {
  const lender = await requireLender();
  if (lender.role === "viewer") redirect("/politicas");
  const parameters = await listParameters(await createClient());
  return (
    <main className="w-full max-w-3xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/politicas">Políticas</Link> / Nueva</div>
        <h1 className="heading-page">Nueva política</h1>
        <p className="text-[15px] text-ink-2">Los umbrales que vuestra entidad pide a una operación. Después la aplicas desde el panel de cada caso.</p>
      </div>
      <PolicyForm id={null} initial={{}} canEdit parameters={parameters} />
    </main>
  );
}
