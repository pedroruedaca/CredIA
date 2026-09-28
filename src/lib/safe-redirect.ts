/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/casos"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
