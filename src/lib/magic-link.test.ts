import { describe, expect, it } from "vitest";
import { borrowerLink, delegateExpiry, generateMagicLinkToken, hashToken, isPlausibleToken, linkState } from "./magic-link.ts";

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
  it("builds the borrower link without double slashes", () => {
    expect(borrowerLink("https://app.example/", "abc")).toBe("https://app.example/s/abc");
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
