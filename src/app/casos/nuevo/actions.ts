"use server";

import { appBaseUrl } from "@/lib/app-url";
import type { FieldErrors } from "@/lib/cases/new-case";
import { parseNewCase } from "@/lib/cases/new-case";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { requireLender } from "@/lib/lender";
import { borrowerLink, generateMagicLinkToken, MAGIC_LINK_TTL_DAYS } from "@/lib/magic-link";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

export type CreateCaseState =
  | { status: "idle" }
  | { status: "invalid"; errors: FieldErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> }
  | { status: "created"; caseId: string; companyName: string; borrowerEmail: string; link: string; expiresInDays: number; emailSent: boolean; emailConfigured: boolean; companyDocuments: number; analystDocuments: number };


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
      // The template it was started from (its dashboard applies); a database trigger checks it is this lender's.
      template_id: /^[0-9a-f-]{36}$/i.test(values.template_id ?? "") ? values.template_id : null,
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
      source: r.source,
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
    detail: { requirements: c.requirements.map((r) => r.kind), by_lender: c.requirements.filter((r) => r.source === "lender").map((r) => r.kind), link_expires_at: expiresAt },
  });

  const link = borrowerLink(await appBaseUrl(), token);
  // The company is only told about the documents it has to provide; when the analyst provides them all, it is not
  // invited (a link can be issued later with "Nuevo enlace" if a document is then requested from it).
  const companyDocs = c.requirements.filter((r) => r.source === "borrower").map((r) => REQUIREMENT_SPECS.find((s) => s.kind === r.kind)!.label);
  const { sent } = companyDocs.length
    ? await getNotifier().sendBorrowerInvite({ to: c.borrowerEmail, lenderName: lender.lenderName, companyName: c.name, link, documents: companyDocs })
    : { sent: false };
  if (sent) {
    await supabase.from("audit_log").insert({
      lender_id: lender.lenderId, case_id: created.id, actor: "system", action: "borrower.invited", detail: { to: c.borrowerEmail },
    });
  }

  return { status: "created", caseId: created.id, companyName: c.name, borrowerEmail: c.borrowerEmail, link, expiresInDays: MAGIC_LINK_TTL_DAYS, emailSent: sent, emailConfigured: isEmailConfigured(), companyDocuments: companyDocs.length, analystDocuments: c.requirements.length - companyDocs.length };
}
