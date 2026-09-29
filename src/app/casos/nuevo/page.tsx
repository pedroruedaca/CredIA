import Link from "next/link";
import { requireLender } from "@/lib/lender";
import { NewCaseForm } from "./NewCaseForm";

export const metadata = { title: "Nuevo caso · credIA" };

export default async function NuevoCasoPage() {
  await requireLender();
  return (
    <main className="w-full max-w-2xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/casos">Casos</Link> / Nuevo</div>
        <h1 className="heading-page">Nuevo caso</h1>
      </div>
      <NewCaseForm />
    </main>
  );
}
