import { describe, expect, it } from "vitest";
import { borrowerLink, generateMagicLinkToken, hashToken } from "./magic-link.ts";

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
