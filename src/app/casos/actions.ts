"use server";

import { borrowerRequirements, REQUIREMENT_SPECS } from "@/lib/cases/requirements";
import { appBaseUrl } from "@/lib/app-url";
import { requireLender } from "@/lib/lender";
import { borrowerLink, generateMagicLinkToken, MAGIC_LINK_TTL_DAYS } from "@/lib/magic-link";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

export type RegenerateLinkResult =
  | { ok: true; link: string; expiresInDays: number; borrowerEmail: string | null; emailSent: boolean; emailConfigured: boolean }
  | { ok: false; message: string };

/**
 * Issues a new borrower link for a case and invalidates the previous one (only its hash was stored, so a lost
 * link cannot be shown again). Documents already uploaded stay; gestoría links keep working until they expire.
 */
export async function regenerateBorrowerLink(caseId: string): Promise<RegenerateLinkResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (typeof caseId !== "string" || !/^[0-9a-f-]{36}$/i.test(caseId)) return { ok: false, message: "Caso no válido." };

  const supabase = await createClient();
  const { token, hash, expiresAt } = generateMagicLinkToken();
  // RLS limits the update to this lender's cases; an unknown or foreign id updates nothing.
  const { data: kase, error } = await supabase
    .from("cases")
    .update({ borrower_token_hash: hash, borrower_token_expires_at: expiresAt })
    .eq("id", caseId)
    .neq("status", "archived")
    .select("id, borrower_name, borrower_email, consent_withdrawn_at, case_requirements(doc_kind, required, source)")
    .maybeSingle();
  if (error || !kase) {
    // Log the reason (never the token): a database error, or no row (case not visible to this lender or archived).
    console.error(`[link] regenerate failed for case ${caseId}: ${error ? `${error.code ?? ""} ${error.message}` : "no row updated"}`);
    return { ok: false, message: "No hemos podido generar el enlace. Recarga la página e inténtalo de nuevo." };
  }

  const link = borrowerLink(await appBaseUrl(), token);
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: kase.id,
    actor: lender.userId,
    action: "borrower.link_regenerated",
    detail: { link_expires_at: expiresAt },
  });

  let emailSent = false;
  if (kase.borrower_email && !kase.consent_withdrawn_at) {
    ({ sent: emailSent } = await getNotifier().sendBorrowerInvite({
      to: kase.borrower_email,
      lenderName: lender.lenderName,
      companyName: kase.borrower_name ?? "",
      link,
      documents: borrowerRequirements((kase.case_requirements as { doc_kind: string; required: boolean; source: string }[] | null) ?? []).map((r) => REQUIREMENT_SPECS.find((s) => s.kind === r.doc_kind)?.label ?? r.doc_kind),
    }));
    if (emailSent) {
      await supabase.from("audit_log").insert({
        lender_id: lender.lenderId, case_id: kase.id, actor: "system", action: "borrower.invited", detail: { to: kase.borrower_email },
      });
    }
  }

  return { ok: true, link, expiresInDays: MAGIC_LINK_TTL_DAYS, borrowerEmail: kase.borrower_email, emailSent, emailConfigured: isEmailConfigured() };
}
