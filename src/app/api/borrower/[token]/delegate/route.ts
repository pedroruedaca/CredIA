/**
 * POST /api/borrower/:token/delegate
 * "Enviar esta petición a mi gestoría": creates a separate magic-link token scoped to the same case, emails it
 * (stub) and returns the link so the company can also forward it themselves. Only the hash is stored.
 * Delegates cannot create further delegate links.
 */
import { z } from "zod";
import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { borrowerAudit } from "@/lib/borrower/access";
import { borrowerAccess, fail } from "@/lib/borrower/http";
import { borrowerLink, generateMagicLinkToken } from "@/lib/magic-link";
import { getNotifier } from "@/lib/notify";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

const MAX_DELEGATES_PER_CASE = 5;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const access = await borrowerAccess(token);
  if (access instanceof NextResponse) return access;
  if (access.actor !== "borrower") return fail(403, "Solo la empresa puede reenviar la petición.");
  const { db, kase } = access;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Escribe un correo electrónico válido.");
  const { email } = parsed.data;

  const { count } = await db
    .from("case_delegates")
    .select("id", { count: "exact", head: true })
    .eq("case_id", kase.id)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_DELEGATES_PER_CASE) return fail(429, "Ya has enviado esta petición a varias personas. Si necesitas otra, contacta con la entidad.");

  // Same lifetime as a new link, but never beyond the company's own link.
  const { token: delegateToken, hash, expiresAt } = generateMagicLinkToken();
  const caseExpiry = kase.borrower_token_expires_at ? new Date(kase.borrower_token_expires_at) : null;
  const expires = caseExpiry && caseExpiry < new Date(expiresAt) ? caseExpiry.toISOString() : expiresAt;

  const { data: delegate, error } = await db
    .from("case_delegates")
    .insert({ case_id: kase.id, lender_id: kase.lender_id, email, token_hash: hash, expires_at: expires })
    .select("id")
    .single();
  if (error || !delegate) return fail(500, "No hemos podido crear el enlace. Inténtalo de nuevo.");

  const link = borrowerLink(await appBaseUrl(), delegateToken);
  const { sent } = await getNotifier().sendDelegateInvite({
    to: email,
    lenderName: kase.lender_name,
    companyName: kase.borrower_name ?? kase.borrower_cif,
    link,
  });
  await borrowerAudit(access, "delegate.created", { delegate_id: delegate.id, to: email, expires_at: expires, email_sent: sent });

  return NextResponse.json({ ok: true, sent, link, email });
}
