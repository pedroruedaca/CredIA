/**
 * POST /api/borrower/:link/delegate — "Enviar esta petición a mi gestoría".
 * Creates a separate magic link scoped to the same case (hash stored, never the token), emails it (stub)
 * and returns it so the borrower can also forward it themselves. Only the company's own link can delegate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/app-url";
import { audit, borrowerRoute, jsonError } from "@/lib/borrower/access";
import { RATE_LIMITED_MESSAGE } from "@/lib/borrower/limits";
import { withinRateLimit } from "@/lib/borrower/rate";
import { borrowerLink, delegateExpiry, generateMagicLinkToken } from "@/lib/magic-link";
import { getNotifier } from "@/lib/notify";

export const runtime = "nodejs";

const MAX_ACTIVE_DELEGATES = 5;

const body = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(req: Request, ctx: { params: Promise<{ link: string }> }) {
  const r = await borrowerRoute((await ctx.params).link);
  if (r.response) return r.response;
  const { db, access } = r;
  if (access.actor !== "borrower") return jsonError("Solo la empresa puede enviar la petición a otra persona.", 403);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Indica un correo electrónico válido.", 400);
  const { email } = parsed.data;

  const nowIso = new Date().toISOString();
  const { count } = await db
    .from("delegate_links")
    .select("id", { count: "exact", head: true })
    .eq("case_id", access.caseId)
    .is("revoked_at", null)
    .gt("expires_at", nowIso);
  if ((count ?? 0) >= MAX_ACTIVE_DELEGATES) {
    return jsonError("Ya has enviado varios enlaces. Si necesitas otro, contacta con la entidad.", 429);
  }
  if (!(await withinRateLimit(db, "delegate", access))) return jsonError(RATE_LIMITED_MESSAGE.delegate, 429);

  const { data: kase } = await db
    .from("cases")
    .select("borrower_name, lenders(name)")
    .eq("id", access.caseId)
    .single();
  const { token, hash } = generateMagicLinkToken();
  const expiresAt = delegateExpiry(access.linkExpiresAt);

  const { data: link, error } = await db
    .from("delegate_links")
    .insert({ case_id: access.caseId, lender_id: access.lenderId, email, token_hash: hash, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !link) return jsonError("No hemos podido crear el enlace. Inténtalo de nuevo.", 500);

  const url = borrowerLink(await appBaseUrl(), token);
  const lenderName = (kase?.lenders as unknown as { name: string } | null)?.name ?? "";
  const { sent } = await getNotifier().sendDelegateInvite({
    to: email,
    lenderName,
    companyName: kase?.borrower_name ?? "",
    link: url,
    requestedBy: "borrower",
  });

  await audit(db, access, "delegate.invited", { delegate_link_id: link.id, email, expires_at: expiresAt, emailed: sent });
  return NextResponse.json({ ok: true, link: url, emailSent: sent, expiresAt });
}
