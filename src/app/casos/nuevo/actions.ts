"use server";

import { appBaseUrl } from "@/lib/app-url";
import type { FieldErrors } from "@/lib/cases/new-case";
import { parseNewCase } from "@/lib/cases/new-case";
import { REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { templateCostOfSales, templatePolicyId } from "@/lib/cases/template-store";
import { listParameters } from "@/lib/policies/parameter-store";
import { criteriaParameterIds } from "@/lib/policies/policy";
import { getPolicy } from "@/lib/policies/store";
import { requireLender } from "@/lib/lender";
import { borrowerLink, generateMagicLinkToken, MAGIC_LINK_TTL_DAYS } from "@/lib/magic-link";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // The template's default policy decides which per-case parameters are required (read here, never from the browser).
  const supabase = await createClient();
  const templateId = /^[0-9a-f-]{36}$/i.test(values.template_id ?? "") ? values.template_id! : null;
  const [parameters, policyId] = await Promise.all([listParameters(supabase), templateId ? templatePolicyId(supabase, templateId) : null]);
  const policy = policyId ? await getPolicy(supabase, policyId) : null;
  const required = new Set(policy ? criteriaParameterIds(policy.criteria) : []);

  const parsed = parseNewCase(values, parameters, required);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const c = parsed.data;

  const { token, hash, expiresAt } = generateMagicLinkToken();

  const { data: created, error } = await supabase
    .from("cases")
    .insert({
      lender_id: lender.lenderId,
      borrower_cif: c.cif,
      borrower_name: c.name,
      fiscal_year_end: c.fiscalYearEnd,
      borrower_email: c.borrowerEmail,
      borrower_token_hash: hash,
      borrower_token_expires_at: expiresAt,
      created_by: lender.userId,
      // The template it was started from (its dashboard applies); a database trigger checks it is this lender's.
      template_id: templateId,
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
    // Keep create all-or-nothing. Only owners may delete cases through their session (0023), so the case this request
    // just created is removed with the service role.
    await createAdminClient().from("cases").delete().eq("id", created.id).eq("lender_id", lender.lenderId);
    return { status: "failed", message: "No hemos podido guardar los documentos solicitados. Inténtalo de nuevo.", values };
  }

  // The per-case parameter values given on the form (the database checks each is a per-case parameter of this lender).
  if (c.parameterValues.length) {
    const { error: paramErr } = await supabase.from("case_parameter_values").insert(
      c.parameterValues.map((v) => ({ case_id: created.id, lender_id: lender.lenderId, parameter_id: v.parameterId, value: v.value, updated_by: lender.userId })),
    );
    if (paramErr) {
      await createAdminClient().from("cases").delete().eq("id", created.id).eq("lender_id", lender.lenderId);
      return { status: "failed", message: "No hemos podido guardar los parámetros del caso. Inténtalo de nuevo.", values };
    }
  }

  // The template's cost of sales (adjusted gross margin), copied: later template edits never change this case.
  const cost = templateId ? await templateCostOfSales(supabase, templateId) : null;
  if (cost) {
    await supabase.from("case_cost_definitions").insert({ case_id: created.id, lender_id: lender.lenderId, preset: cost.preset, selectors: cost.selectors, source: "template", updated_by: lender.userId });
  }

  // The template's default credit policy, applied to the case (the analyst can change or remove it there). A failure
  // leaves the case without a policy rather than failing its creation.
  if (policyId) await supabase.from("cases").update({ policy_id: policyId }).eq("id", created.id);

  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: created.id,
    actor: lender.userId,
    action: "case.created",
    detail: { requirements: c.requirements.map((r) => r.kind), parameters: c.parameterValues.map((v) => ({ parameter_id: v.parameterId, value: v.value })), by_lender: c.requirements.filter((r) => r.source === "lender").map((r) => r.kind), link_expires_at: expiresAt, ...(policyId ? { policy_id: policyId } : {}) },
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
      lender_id: lender.lenderId, case_id: created.id, actor: lender.userId, action: "borrower.invited", detail: { to: c.borrowerEmail },
    });
  }

  return { status: "created", caseId: created.id, companyName: c.name, borrowerEmail: c.borrowerEmail, link, expiresInDays: MAGIC_LINK_TTL_DAYS, emailSent: sent, emailConfigured: isEmailConfigured(), companyDocuments: companyDocs.length, analystDocuments: c.requirements.length - companyDocs.length };
}
