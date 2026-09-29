import { describe, expect, it } from "vitest";
import { normaliseBaseUrl } from "./base-url.ts";

describe("normaliseBaseUrl", () => {
  it("accepts the usual ways people type the site address", () => {
    expect(normaliseBaseUrl("https://cred-ia.vercel.app")).toBe("https://cred-ia.vercel.app");
    expect(normaliseBaseUrl("https://cred-ia.vercel.app/")).toBe("https://cred-ia.vercel.app");
    expect(normaliseBaseUrl("  cred-ia.vercel.app  ")).toBe("https://cred-ia.vercel.app");
    expect(normaliseBaseUrl('"https://cred-ia.vercel.app/casos"')).toBe("https://cred-ia.vercel.app");
    expect(normaliseBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("rejects values that would produce a broken link", () => {
    expect(normaliseBaseUrl("")).toBeNull();
    expect(normaliseBaseUrl(undefined)).toBeNull();
    expect(normaliseBaseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseBaseUrl("ftp://cred-ia.vercel.app")).toBeNull();
    expect(normaliseBaseUrl("credia")).toBeNull();
  });
});
