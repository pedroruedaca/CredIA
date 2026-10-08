import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Lender-only areas. Borrower pages (/s/…) and borrower API routes authenticate with the magic-link cookie. */
const LENDER_PATHS = /^\/(casos)(\/|$)/;

/** A link emailed before links moved the token to the fragment (`/s/<token>`; see `borrowerLink`). */
const LEGACY_LINK = /^\/s\/([A-Za-z0-9_-]{43})\/?$/;

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/s/")) return legacyLink(request);

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Refreshes the session cookie; must run before any redirect decision.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && LENDER_PATHS.test(request.nextUrl.pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

/** `/s/<token>` → `/s#<token>`, so the landing page swaps it for a cookie like a new link. Other `/s/…` pages pass. */
function legacyLink(request: NextRequest) {
  const token = LEGACY_LINK.exec(request.nextUrl.pathname)?.[1];
  if (!token) return NextResponse.next();
  const to = request.nextUrl.clone();
  to.pathname = "/s";
  to.hash = token;
  const res = NextResponse.redirect(to, 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/borrower|api/cron|s/).*)", "/s/:link"],
};
