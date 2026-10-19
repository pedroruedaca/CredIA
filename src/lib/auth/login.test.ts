import { describe, expect, it } from "vitest";
import { authProviders, cleanCode, codeError, linkError, parseLinkError, sendError, signInLinkUrl, tokenFromFragment } from "./login.ts";

describe("login providers", () => {
  it("reads google and microsoft from the setting, once each", () => {
    expect(authProviders("google, Microsoft, azure, github")).toEqual(["google", "azure"]);
    expect(authProviders(undefined)).toEqual([]);
  });
});

describe("login errors", () => {
  it("tells apart rate limits, emails without access and bad emails when sending", () => {
    expect(sendError({ code: "over_email_send_rate_limit", status: 429 })).toBe("rate_limited");
    expect(sendError({ message: "For security purposes, you can only request this after 42 seconds." })).toBe("rate_limited");
    expect(sendError({ code: "otp_disabled", message: "Signups not allowed for otp" })).toBe("no_access");
    expect(sendError({ code: "email_address_invalid" })).toBe("invalid_email");
    expect(sendError({ message: "fetch failed" })).toBe("unavailable");
  });
  it("tells apart another browser, an expired link and no access when opening the link", () => {
    expect(linkError({ name: "AuthPKCECodeVerifierMissingError", message: "PKCE code verifier not found in storage." })).toBe("other_browser");
    expect(linkError({ code: "otp_expired", description: "Email link is invalid or has expired" })).toBe("expired");
    expect(linkError({ code: "signup_disabled", description: "Signups not allowed for this instance" })).toBe("no_access");
    expect(linkError({})).toBe("failed");
  });
  it("reads the kind back from the URL, the old ?error=1 included", () => {
    expect(parseLinkError("1")).toBe("expired");
    expect(parseLinkError("other_browser")).toBe("other_browser");
    expect(parseLinkError("<script>")).toBe("failed");
    expect(parseLinkError(undefined)).toBeNull();
  });
  it("a wrong or old code is said as such", () => {
    expect(codeError({ code: "otp_expired", status: 403 })).toBe("wrong_or_expired");
    expect(codeError({ status: 429 })).toBe("rate_limited");
  });
  it("keeps only the digits of the code", () => {
    expect(cleanCode(" 123 456 ")).toEqual({ code: "123456", complete: true });
    expect(cleanCode("12-34")).toEqual({ code: "1234", complete: false });
  });
});

describe("sign-in link in the welcome email", () => {
  it("puts the token in the fragment of /auth/entrar and reads it back", () => {
    const url = signInLinkUrl("https://www.getcredia.com/", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8");
    expect(url).toBe("https://www.getcredia.com/auth/entrar#t=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8");
    expect(tokenFromFragment(new URL(url).hash)).toBe("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8");
  });
  it("ignores a missing or malformed token", () => {
    expect(tokenFromFragment("")).toBeNull();
    expect(tokenFromFragment("#t=")).toBeNull();
    expect(tokenFromFragment("#t=short")).toBeNull();
    expect(tokenFromFragment("#t=<script>alert(1)</script>xxxxxxxx")).toBeNull();
  });
});
