import Link from "next/link";
import { redirect } from "next/navigation";
import { requireLender } from "@/lib/lender";
import { TemplateForm } from "../TemplateForm";

export const metadata = { title: "Nueva plantilla · credIA" };

export default async function NuevaPlantillaPage() {
  const lender = await requireLender();
  if (lender.role === "viewer") redirect("/plantillas");
  return (
    <main className="w-full max-w-2xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/plantillas">Plantillas</Link> / Nueva</div>
        <h1 className="heading-page">Nueva plantilla</h1>
        <p className="text-[15px] text-ink-2">Después de crearla podrás diseñar su panel del caso.</p>
      </div>
      <TemplateForm id={null} initial={{}} canEdit />
    </main>
  );
}
