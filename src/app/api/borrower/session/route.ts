/**
 * POST /api/borrower/session — opens a company or gestoría link: the landing page (`/s#<token>`) sends the token from
 * the URL fragment, gets it back as HttpOnly cookies scoped to the link's pages and APIs, and moves to `/s/<handle>`.
 * Only valid links get a cookie; withdrawn consent still opens (the page says so).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, resolveBorrowerAccess } from "@/lib/borrower/access";
import { setLinkCookies } from "@/lib/borrower/link-session";
import { linkHandle } from "@/lib/magic-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().max(100) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("invalid", 400);

  const res = await resolveBorrowerAccess(createAdminClient(), body.data.token);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 404 });

  const out = NextResponse.json({ handle: linkHandle(body.data.token) });
  setLinkCookies(out, body.data.token, res.access.linkExpiresAt);
  return out;
}
