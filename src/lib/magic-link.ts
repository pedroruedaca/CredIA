/**
 * Borrower magic-link tokens. Only the SHA-256 hash and expiry are stored; the raw token is shown once
 * to the lender (and emailed to the borrower) and is never logged.
 */
import { createHash, randomBytes } from "node:crypto";

export const MAGIC_LINK_TTL_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateMagicLinkToken(now = new Date()): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash: hashToken(token), expiresAt: expires.toISOString() };
}

/**
 * The link emailed to the company or gestoría. The token goes in the fragment, which browsers never send to the server:
 * it stays out of request logs. The landing page (`/s`) swaps it for a cookie and moves to `/s/<handle>` (`linkHandle`),
 * replacing the history entry, so the token is not kept in browser history either. Links sent before (`/s/<token>`) are
 * redirected to this form by the middleware.
 */
export function borrowerLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s#${token}`;
}

/**
 * Public id of a link in URLs after the exchange (`/s/<handle>`, `/api/borrower/<handle>/…`). Derived from the token, so
 * nothing is stored, but it grants nothing by itself: requests also need the link cookie, whose token must give back
 * this handle.
 */
export function linkHandle(token: string): string {
  return createHash("sha256").update(`credia:link-handle:${token}`).digest("base64url").slice(0, 16);
}

export function isPlausibleHandle(handle: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(handle);
}

/** Cheap shape check before any database lookup. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type LinkState = "valid" | "expired" | "revoked";

export function linkState(link: { expiresAt: string | null; revokedAt?: string | null }, now = new Date()): LinkState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** A delegate (gestoría) link never outlives the borrower's own link. */
export function delegateExpiry(caseLinkExpiresAt: string | null, now = new Date()): string {
  const own = generateMagicLinkToken(now).expiresAt;
  return caseLinkExpiresAt && caseLinkExpiresAt < own ? caseLinkExpiresAt : own;
}
