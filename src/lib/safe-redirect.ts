/**
 * Only same-origin relative paths are allowed as post-login destinations. Control characters and backslashes are
 * refused outright: URL parsers drop tabs and newlines and read `\` as `/`, so `/\t/evil.example` or `/\evil.example`
 * would otherwise become `//evil.example`, another site.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/casos"): string {
  // eslint-disable-next-line no-control-regex
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://credia.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return next.startsWith("//") ? fallback : next;
}
