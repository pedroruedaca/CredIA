/** One policy parameter: its form, which policies use it, and how to delete it. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLender } from "@/lib/lender";
import { getParameter } from "@/lib/policies/parameter-store";
import { listPolicies } from "@/lib/policies/store";
import { createClient } from "@/lib/supabase/server";
import { ParameterForm } from "../ParameterForm";
import { DeleteParameter } from "./DeleteParameter";

export const metadata = { title: "Parámetro · credIA" };
export const dynamic = "force-dynamic";

export default async function ParametroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lender = await requireLender();
  const canEdit = lender.role !== "viewer";
  const db = await createClient();
  const [p, policies] = await Promise.all([getParameter(db, id), listPolicies(db)]);
  if (!p) notFound();
  const users = policies.filter((x) => x.criteria.some((c) => c.parameter?.id === p.id));
  return (
    <main className="w-full max-w-3xl px-4 py-10 sm:px-14 sm:py-12">
      <div className="mb-10 flex flex-col gap-3">
        <div className="text-[13px] text-muted"><Link href="/politicas">Políticas</Link> / <Link href="/politicas/parametros">Parámetros</Link> / {p.name}</div>
        <h1 className="heading-page">{p.name}</h1>
        <p className="text-[15px] text-ink-2">
          {users.length ? (
            <>
              Lo usa{users.length === 1 ? " la política" : "n las políticas"}{" "}
              {users.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ", "}
                  <Link href={`/politicas/${u.id}`}>{u.name}</Link>
                </span>
              ))}
              .
            </>
          ) : (
            "Ninguna política lo usa todavía."
          )}
        </p>
      </div>
      <ParameterForm key={p.id} id={p.id} canEdit={canEdit} initial={{ name: p.name, description: p.description ?? "", unit: p.unit }} />
      {canEdit && (
        <div className="mt-12">
          <DeleteParameter id={p.id} />
        </div>
      )}
    </main>
  );
}
