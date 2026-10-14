/**
 * Lender sign-in: which providers are on, and what went wrong, in words the person can act on. Pure.
 *
 * Sign-in is an email with a link and a code (the code works on any device; the link only in the browser that asked
 * for it, PKCE), plus optional «Continuar con Google / Microsoft» when CREDIA_AUTH_PROVIDERS lists them and they are
 * configured in Supabase. Nobody signs up from here: accounts are created by an invitation («Ajustes») or the
 * platform admin, so an unknown email is «sin acceso».
 */

export type OAuthProvider = "google" | "azure";

/** Providers shown on the login page, from CREDIA_AUTH_PROVIDERS ("google,microsoft"); unknown names ignored. */
export function authProviders(raw: string | undefined): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  for (const p of (raw ?? "").toLowerCase().split(/[\s,;]+/)) {
    const v = p === "microsoft" || p === "azure" ? "azure" : p === "google" ? "google" : null;
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  name?: string | null;
}

/** Asking for the email failed. */
export type SendError = "rate_limited" | "no_access" | "invalid_email" | "unavailable";

export function sendError(e: AuthErrorLike): SendError {
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || e.status === 429 || /rate limit|only request this after|security purposes/.test(msg)) return "rate_limited";
  if (code === "otp_disabled" || code === "signup_disabled" || code === "user_not_found" || /signups? not allowed|not found/.test(msg)) return "no_access";
  if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email|email.*invalid/.test(msg)) return "invalid_email";
  return "unavailable";
}

/** Typing the code failed. */
export type CodeError = "wrong_or_expired" | "rate_limited" | "unavailable";

export function codeError(e: AuthErrorLike): CodeError {
  const code = e.code ?? "";
  if (code === "over_request_rate_limit" || e.status === 429) return "rate_limited";
  if (code === "otp_expired" || code === "validation_failed" || e.status === 403 || e.status === 400 || /expired|invalid/i.test(e.message ?? "")) return "wrong_or_expired";
  return "unavailable";
}

/** Opening the link (or coming back from Google / Microsoft) failed: the `?error=` the login page explains. */
export type LinkError = "other_browser" | "expired" | "no_access" | "failed";

export function linkError(e: AuthErrorLike & { description?: string | null }): LinkError {
  const code = e.code ?? "";
  const text = `${e.message ?? ""} ${e.description ?? ""}`.toLowerCase();
  if (code === "pkce_code_verifier_not_found" || code === "bad_code_verifier" || e.name === "AuthPKCECodeVerifierMissingError" || /code verifier/.test(text)) return "other_browser";
  if (code === "signup_disabled" || code === "user_not_found" || code === "otp_disabled" || /signups? not allowed|not allowed for this instance/.test(text)) return "no_access";
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found" || /expired|invalid|already used/.test(text)) return "expired";
  return "failed";
}

const LINK_ERRORS: readonly LinkError[] = ["other_browser", "expired", "no_access", "failed"];
/** `?error=` from the URL → a known kind (the old `?error=1` meant an expired or used link). */
export const parseLinkError = (v: string | undefined): LinkError | null =>
  !v ? null : v === "1" ? "expired" : (LINK_ERRORS as readonly string[]).includes(v) ? (v as LinkError) : "failed";

/** Seconds before another email may be asked for (Supabase refuses a second one sooner). */
export const RESEND_AFTER_S = 60;

/** The code as typed → digits only; valid when it has 6 to 10 of them (Supabase's configurable length). */
export function cleanCode(raw: string): { code: string; complete: boolean } {
  const code = raw.replace(/\D/g, "").slice(0, 10);
  return { code, complete: code.length >= 6 };
}
