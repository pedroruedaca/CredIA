/**
 * Platform admin («Administración de credIA»): create lenders and their first owner, see who is on the platform, and
 * delete a lender with everything in it («Eliminar», not on the admin's own lender).
 * Only for emails in CREDIA_ADMIN_EMAILS; everyone else gets a 404, so the page does not reveal it exists.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Pill } from "@/components/ui/Pill";
import { formatDate } from "@/lib/format";
import { isPlatformAdmin } from "@/lib/platform/admin";
import { listLenders } from "@/lib/platform/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DeleteLender } from "./DeleteLender";
import { NewLenderForm } from "./NewLenderForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administración · credIA", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ eliminada?: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isPlatformAdmin(user.email)) notFound();
  const [lenders, { data: own }, params] = await Promise.all([
    listLenders(),
    createAdminClient().from("lender_members").select("lender_id").eq("user_id", user.id),
    searchParams,
  ]);
  const ownLenders = new Set((own ?? []).map((m) => m.lender_id as string));
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="grow" />
          <Link href="/casos" className="inline-flex min-h-11 items-center text-[13px] font-medium">Volver a credIA</Link>
        </div>
        <h1 className="heading-page mt-4">Administración de credIA</h1>
        <p className="max-w-[640px] text-[17px] text-ink-2">
          Da de alta entidades y su primera persona administradora. Lo demás (equipo, casos, ajustes) lo gestiona cada entidad.
        </p>
      </div>

      <section aria-labelledby="nueva" className="mb-14 flex max-w-xl flex-col gap-4">
        <h2 id="nueva" className="heading-section">Nueva entidad</h2>
        <NewLenderForm />
      </section>

      <section aria-labelledby="entidades" className="flex flex-col gap-3">
        <h2 id="entidades" className="heading-section">Entidades · {lenders.length}</h2>
        {params.eliminada === "1" && (
          <p role="status" className="flex items-center gap-2 text-[15px] text-ink-2"><Pill tone="ok">Eliminada</Pill> La entidad, sus casos, sus archivos y su equipo se han borrado.</p>
        )}
        <ul className="flex flex-col">
          {lenders.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-hairline py-3 last:border-b-0">
              <span className="min-w-0 grow">
                <span className="block text-[15px] font-medium">{l.name}</span>
                <span className="block truncate text-[13px] text-muted">{l.owners.length ? l.owners.join(", ") : "Sin owner"}</span>
              </span>
              <span className="text-[13px] text-muted">
                <span className="font-mono">{l.members}</span> {l.members === 1 ? "persona" : "personas"} · <span className="font-mono">{l.cases}</span> {l.cases === 1 ? "caso" : "casos"} · desde {formatDate(l.createdAt)}
              </span>
              {!ownLenders.has(l.id) && <DeleteLender lenderId={l.id} name={l.name} cases={l.cases} members={l.members} />}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
