/**
 * Normalises a configured public base URL (NEXT_PUBLIC_APP_URL): trims spaces and quotes, adds https:// when the
 * scheme is missing, drops paths and trailing slashes. Returns null when it is not a usable http(s) origin, so
 * callers fall back to the request host instead of emailing a broken link.
 */
export function normaliseBaseUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export interface BaseUrlEnv {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
}

/**
 * Where links sent by email point (company and gestoría links, team invites). Never the request's Host or
 * X-Forwarded-Host header outside development: a forged header would put another site in an emailed magic link.
 * Order: NEXT_PUBLIC_APP_URL → on Vercel, the project's production domain (production) or the branch/deployment URL
 * (previews), which Vercel sets itself → in development, the request host (`fromRequest`) → otherwise an error.
 */
export function resolveBaseUrl(env: BaseUrlEnv, fromRequest: () => string | null): string {
  const configured = normaliseBaseUrl(env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;
  if (env.VERCEL) {
    const vercel =
      env.VERCEL_ENV === "production"
        ? normaliseBaseUrl(env.VERCEL_PROJECT_PRODUCTION_URL)
        : (normaliseBaseUrl(env.VERCEL_BRANCH_URL) ?? normaliseBaseUrl(env.VERCEL_URL));
    if (vercel) return vercel;
  } else if (env.NODE_ENV !== "production") {
    const local = normaliseBaseUrl(fromRequest());
    if (local) return local;
  }
  throw new Error("NEXT_PUBLIC_APP_URL is not set: links sent by email need the site's public address");
}
