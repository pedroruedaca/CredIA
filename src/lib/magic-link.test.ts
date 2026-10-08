import { describe, expect, it } from "vitest";
import { borrowerLink, delegateExpiry, generateMagicLinkToken, hashToken, isPlausibleHandle, isPlausibleToken, linkHandle, linkState } from "./magic-link.ts";

describe("magic-link tokens", () => {
  it("generates a URL-safe 256-bit token whose hash matches hashToken", () => {
    const { token, hash } = generateMagicLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("expires 30 days after creation", () => {
    const now = new Date("2026-09-28T10:00:00Z");
    expect(generateMagicLinkToken(now).expiresAt).toBe("2026-10-28T10:00:00.000Z");
  });
  it("tokens are unique", () => {
    expect(generateMagicLinkToken().token).not.toBe(generateMagicLinkToken().token);
  });
  it("builds the borrower link with the token in the fragment, never in the path", () => {
    const { token } = generateMagicLinkToken();
    const link = new URL(borrowerLink("https://app.example/", token));
    expect(link.href).toBe(`https://app.example/s#${token}`);
    expect(link.pathname + link.search).not.toContain(token);
  });
});

describe("link handles", () => {
  it("are stable, URL-safe, distinct per token and never a token or its stored hash", () => {
    const { token, hash } = generateMagicLinkToken();
    const handle = linkHandle(token);
    expect(handle).toBe(linkHandle(token));
    expect(isPlausibleHandle(handle)).toBe(true);
    expect(isPlausibleToken(handle)).toBe(false);
    expect(isPlausibleHandle(token)).toBe(false);
    expect(token).not.toContain(handle);
    expect(hash).not.toContain(handle);
    expect(linkHandle(generateMagicLinkToken().token)).not.toBe(handle);
  });
  it("shape check rejects path tricks", () => {
    for (const bad of ["", "../../casos", "abc", "AAAAAAAAAAAAAAA/", "AAAAAAAAAAAAAAAAA"]) expect(isPlausibleHandle(bad)).toBe(false);
  });
});

describe("link state", () => {
  const now = new Date("2026-09-28T10:00:00Z");
  it("valid until the expiry instant, then expired; revocation wins", () => {
    expect(linkState({ expiresAt: "2026-09-28T10:00:01Z" }, now)).toBe("valid");
    expect(linkState({ expiresAt: "2026-09-28T10:00:00Z" }, now)).toBe("expired");
    expect(linkState({ expiresAt: "2026-10-28T10:00:00Z", revokedAt: "2026-09-01T00:00:00Z" }, now)).toBe("revoked");
  });
  it("token shape check rejects anything that is not a 43-char base64url token", () => {
    expect(isPlausibleToken(generateMagicLinkToken().token)).toBe(true);
    expect(isPlausibleToken("abc")).toBe(false);
    expect(isPlausibleToken("a".repeat(42) + "/")).toBe(false);
  });
  it("delegate links expire with the borrower link at the latest", () => {
    expect(delegateExpiry("2026-10-05T00:00:00.000Z", now)).toBe("2026-10-05T00:00:00.000Z");
    expect(delegateExpiry("2027-01-01T00:00:00.000Z", now)).toBe("2026-10-28T10:00:00.000Z");
    expect(delegateExpiry(null, now)).toBe("2026-10-28T10:00:00.000Z");
  });
});
