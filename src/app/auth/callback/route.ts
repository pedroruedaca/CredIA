/**
 * Where the email link and Google / Microsoft come back to. Exchanges the code for a session (PKCE: only in the browser
 * that asked) and goes on; on failure, back to /login with what happened (`?error=other_browser|expired|no_access|failed`).
 */
import { NextResponse } from "next/server";
import { linkError } from "@/lib/auth/login";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (kind: string) => NextResponse.redirect(new URL(`/login?error=${kind}${next !== "/casos" ? `&next=${encodeURIComponent(next)}` : ""}`, url.origin));
  // Supabase reports some failures itself (expired link, sign-ups closed) as query parameters.
  const reported = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (reported) return fail(linkError({ code: url.searchParams.get("error_code"), description: url.searchParams.get("error_description") }));
  if (!code) return fail("expired");
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(linkError(error as { code?: string; message?: string; name?: string }));
  return NextResponse.redirect(new URL(next, url.origin));
}
