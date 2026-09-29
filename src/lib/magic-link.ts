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

export function borrowerLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${token}`;
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
