import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, newNonce } from "./csp.ts";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy({ nonce: "abc123==", supabaseUrl: "https://xyz.supabase.co/" });

  it("runs only scripts with the request's nonce, and what they load", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
  });

  it("lets the browser call only the app and the Supabase origin", () => {
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://xyz.supabase.co");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("forbids framing, plugins, foreign forms and base rewriting", () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "frame-src 'none'", "form-action 'self'", "base-uri 'self'"]) {
      expect(csp.split("; ")).toContain(d);
    }
  });

  it("keeps inline styles (React style props) without a style nonce that would disable them", () => {
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("adds eval only for React's dev tooling, and drops a malformed Supabase URL", () => {
    expect(directive(contentSecurityPolicy({ nonce: "n", dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy({ nonce: "n", supabaseUrl: "javascript:alert(1)" }), "connect-src")).toBe("connect-src 'self'");
    expect(directive(contentSecurityPolicy({ nonce: "n", supabaseUrl: "not a url" }), "connect-src")).toBe("connect-src 'self'");
  });
});

describe("newNonce", () => {
  it("is 128 random bits in base64, different each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});
