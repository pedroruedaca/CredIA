/**
 * Content-Security-Policy for every page, set by the middleware with a fresh nonce per request. Pure; runs on the edge.
 *
 * Scripts: only those carrying the request's nonce (Next adds it to its own when it finds the nonce in the request's
 * CSP header) and whatever they load (`strict-dynamic`). No inline script, no `eval` (except React's dev tooling), no
 * other host. Styles allow inline: React `style` props and Next's font CSS need it, and a nonce in `style-src` would
 * switch `unsafe-inline` off. The browser talks only to the app and to Supabase (lender login, signed uploads).
 */
export interface CspOptions {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL; its origin is the only other host the browser may call. */
  supabaseUrl?: string;
  dev?: boolean;
}

export function contentSecurityPolicy({ nonce, supabaseUrl, dev = false }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabase ? [supabase] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** 128 random bits, base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}
