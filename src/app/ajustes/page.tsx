/** Ajustes: entity (name, colour), team (members, roles, invitations), data retention and email status. */
import type { Metadata } from "next";
import { Pill } from "@/components/ui/Pill";
import { DEFAULT_LENDER_COLOR } from "@/content/borrower-portal.es";
import { RETENTION_COPY } from "@/content/case-closing.es";
import { DEFAULT_AUTO_CLOSE_MONTHS, DEFAULT_RETENTION_MONTHS } from "@/lib/cases/closing";
import { relativeTime } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { isEmailConfigured, DEFAULT_FROM } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/team";
import { LenderForm, RetentionForm, TeamSection } from "./SettingsForms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ajustes · credIA" };

export default async function AjustesPage() {
  const lender = await requireLender();
  const isOwner = lender.role === "owner";
  const db = await createClient();
  const { data: l } = await db.from("lenders").select("name, brand_color").eq("id", lender.lenderId).single();
  // On its own: before migration 0025 the columns do not exist and the defaults are shown.
  const { data: r } = await db.from("lenders").select("retention_months, auto_close_months").eq("id", lender.lenderId).maybeSingle();
  const retention = (r as { retention_months?: number; auto_close_months?: number | null } | null) ?? null;
  const now = new Date();
  const members = (await listMembers(lender.lenderId)).map((m) => ({ ...m, lastSignInLabel: m.lastSignInAt ? relativeTime(m.lastSignInAt, now) : "" }));
  const emailOn = isEmailConfigured();
  const from = process.env.CREDIA_EMAIL_FROM || DEFAULT_FROM;

  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14 sm:py-12">
      <h1 className="heading-page">Ajustes</h1>
      {!isOwner && <p className="mt-3 text-[15px] text-ink-2">Solo las personas administradoras pueden cambiar estos ajustes.</p>}

      <section aria-labelledby="entidad" className="mt-10 flex flex-col gap-5">
        <h2 id="entidad" className="heading-section">Entidad</h2>
        <LenderForm name={l?.name ?? lender.lenderName} brandColor={l?.brand_color ?? DEFAULT_LENDER_COLOR} canEdit={isOwner} />
      </section>

      <section aria-labelledby="equipo" className="mt-14 flex flex-col gap-5">
        <div className="flex items-baseline gap-2.5">
          <h2 id="equipo" className="heading-section">Equipo</h2>
          <span className="text-[13px] text-muted">{members.length} {members.length === 1 ? "persona" : "personas"}</span>
        </div>
        <TeamSection members={members} meId={lender.userId} canEdit={isOwner} />
      </section>

      <section aria-labelledby="conservacion" className="mt-14 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="conservacion" className="heading-section">{RETENTION_COPY.title}</h2>
          <p className="max-w-[640px] text-[15px] text-ink-2">{RETENTION_COPY.intro}</p>
        </div>
        <RetentionForm
          retentionMonths={retention?.retention_months ?? DEFAULT_RETENTION_MONTHS}
          autoCloseMonths={retention ? (retention.auto_close_months ?? null) : DEFAULT_AUTO_CLOSE_MONTHS}
          canEdit={isOwner && retention !== null}
        />
      </section>

      <section aria-labelledby="correo" className="mt-14 flex flex-col gap-3">
        <h2 id="correo" className="heading-section">Correo</h2>
        {emailOn ? (
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
            <Pill tone="ok">Activo</Pill> Los correos salen desde <span className="font-mono text-[13px] text-ink">{from}</span>
            {from === DEFAULT_FROM && <span className="text-[13px] text-muted">(remitente de pruebas: solo llega al correo de tu cuenta de Resend)</span>}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
            <Pill tone="warn">Sin configurar</Pill> No se envían correos: comparte tú los enlaces con las empresas.
          </p>
        )}
      </section>
    </main>
  );
}
