import Link from "next/link";
import { requireLender } from "@/lib/lender";
import { NewCaseForm } from "./NewCaseForm";

export const metadata = { title: "Nuevo caso · credIA" };

export default async function NuevoCasoPage() {
  await requireLender();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-10">
      <div className="mb-6 flex flex-col gap-2">
        <div className="text-[13px] text-muted"><Link href="/casos">Casos</Link> / Nuevo</div>
        <h1 className="heading-page">Nuevo caso</h1>
      </div>
      <NewCaseForm />
    </main>
  );
}
