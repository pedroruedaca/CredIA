"use server";

import { headers } from "next/headers";
import type { FieldErrors } from "@/lib/cases/new-case";
import { parseNewCase } from "@/lib/cases/new-case";
import { requireLender } from "@/lib/lender";
import { borrowerLink, generateMagicLinkToken, MAGIC_LINK_TTL_DAYS } from "@/lib/magic-link";
import { getNotifier } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

export type CreateCaseState =
  | { status: "idle" }
  | { status: "invalid"; errors: FieldErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> }
  | { status: "created"; caseId: string; companyName: string; borrowerEmail: string; link: string; expiresInDays: number; emailSent: boolean };

async function appBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createCase(_prev: CreateCaseState, formData: FormData): Promise<CreateCaseState> {
  const lender = await requireLender();
  if (lender.role === "viewer") {
    return { status: "failed", message: "Tu rol solo permite consultar casos.", values: {} };
  }

  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$")) values[k] = v;

  const parsed = parseNewCase(values);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const c = parsed.data;

  const supabase = await createClient();
  const { token, hash, expiresAt } = generateMagicLinkToken();

  const { data: created, error } = await supabase
    .from("cases")
    .insert({
      lender_id: lender.lenderId,
      borrower_cif: c.cif,
      borrower_name: c.name,
      fiscal_year_end: c.fiscalYearEnd,
      requested_amount: c.amount,
      requested_product: c.product,
      requested_term_months: c.termMonths,
      borrower_email: c.borrowerEmail,
      borrower_token_hash: hash,
      borrower_token_expires_at: expiresAt,
      created_by: lender.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { status: "failed", message: "No hemos podido crear el caso. Inténtalo de nuevo.", values };
  }

  const { error: reqErr } = await supabase.from("case_requirements").insert(
    c.requirements.map((r) => ({
      case_id: created.id,
      lender_id: lender.lenderId,
      doc_kind: r.kind,
      required: r.required,
      max_age_days: r.maxAgeDays,
    })),
  );
  if (reqErr) {
    await supabase.from("cases").delete().eq("id", created.id); // keep create all-or-nothing
    return { status: "failed", message: "No hemos podido guardar los documentos solicitados. Inténtalo de nuevo.", values };
  }

  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: created.id,
    actor: lender.userId,
    action: "case.created",
    detail: { requirements: c.requirements.map((r) => r.kind), link_expires_at: expiresAt },
  });

  const link = borrowerLink(await appBaseUrl(), token);
  const { sent } = await getNotifier().sendBorrowerInvite({
    to: c.borrowerEmail,
    lenderName: lender.lenderName,
    companyName: c.name,
    link,
  });
  if (sent) {
    await supabase.from("audit_log").insert({
      lender_id: lender.lenderId, case_id: created.id, actor: "system", action: "borrower.invited", detail: { to: c.borrowerEmail },
    });
  }

  return { status: "created", caseId: created.id, companyName: c.name, borrowerEmail: c.borrowerEmail, link, expiresInDays: MAGIC_LINK_TTL_DAYS, emailSent: sent };
}
