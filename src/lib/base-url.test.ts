import { describe, expect, it } from "vitest";
import { normaliseBaseUrl, resolveBaseUrl } from "./base-url.ts";

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

describe("resolveBaseUrl", () => {
  const fromRequest = () => "https://evil.example";
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    expect(resolveBaseUrl({ NEXT_PUBLIC_APP_URL: "credia.es", VERCEL: "1", VERCEL_ENV: "production" }, fromRequest)).toBe("https://credia.es");
  });
  it("on Vercel, uses the domains Vercel sets, never the request host", () => {
    expect(resolveBaseUrl({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "cred-ia.vercel.app" }, fromRequest)).toBe("https://cred-ia.vercel.app");
    expect(resolveBaseUrl({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "cred-ia-git-x.vercel.app", VERCEL_URL: "cred-ia-abc.vercel.app" }, fromRequest)).toBe("https://cred-ia-git-x.vercel.app");
    expect(resolveBaseUrl({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "cred-ia-abc.vercel.app" }, fromRequest)).toBe("https://cred-ia-abc.vercel.app");
    expect(() => resolveBaseUrl({ VERCEL: "1", VERCEL_ENV: "production" }, fromRequest)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
  it("uses the request host only in development", () => {
    expect(resolveBaseUrl({ NODE_ENV: "development" }, () => "http://localhost:3000")).toBe("http://localhost:3000");
    expect(() => resolveBaseUrl({ NODE_ENV: "production" }, fromRequest)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
