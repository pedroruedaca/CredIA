/**
 * The company's (or gestoría's) link after it is opened: the token lives in an HttpOnly cookie, and URLs carry only the
 * link's handle (`linkHandle`). One cookie per path, `/s/<handle>` and `/api/borrower/<handle>`, so a browser holding
 * several links (a gestoría with many clients) sends each one only to its own pages, and lender pages never see them.
 */
import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isPlausibleHandle, isPlausibleToken, linkHandle, MAGIC_LINK_TTL_DAYS } from "../magic-link.ts";

export const LINK_COOKIE = "credia_link";

export const linkCookiePaths = (handle: string) => [`/s/${handle}`, `/api/borrower/${handle}`];

/**
 * The token behind a portal URL segment: the handle's cookie, if its token gives back that handle. A raw token in the
 * segment is still accepted, for pages opened before links moved to cookies (their API calls carry it); the page
 * itself never sees one, the middleware sends `/s/<token>` to the landing page.
 */
export async function linkToken(segment: string): Promise<string | null> {
  if (isPlausibleToken(segment)) return segment;
  if (!isPlausibleHandle(segment)) return null;
  const token = (await cookies()).get(LINK_COOKIE)?.value;
  if (!token || !isPlausibleToken(token) || linkHandle(token) !== segment) return null;
  return token;
}

/**
 * Sets the link cookies on `res`, kept until the link itself expires. Written as raw headers: `res.cookies` keeps one
 * cookie per name, and these are two cookies of the same name on different paths.
 */
export function setLinkCookies(res: NextResponse, token: string, expiresAt: string | null, now = Date.now()) {
  const until = expiresAt ? new Date(expiresAt).getTime() : now + MAGIC_LINK_TTL_DAYS * 86_400_000;
  const maxAge = Math.max(0, Math.floor((until - now) / 1000));
  for (const path of linkCookiePaths(linkHandle(token))) {
    // Lax, not Strict: the link is opened from an email, a cross-site navigation, and Strict cookies are withheld from
    // it. Lax still keeps them off cross-site POSTs, the only requests that change anything.
    const attrs = [`${LINK_COOKIE}=${token}`, `Path=${path}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
    if (process.env.NODE_ENV === "production") attrs.push("Secure");
    res.headers.append("Set-Cookie", attrs.join("; "));
  }
}
