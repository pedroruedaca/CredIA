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
