/** Required env vars, read lazily so `next build` works without them. Never log the values. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const supabaseUrl = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/**
 * Settings without which no page can load. Read with literal `process.env.X` so Next inlines the public ones.
 * The service role key is server-only and never reaches the browser.
 */
export function missingRequiredConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}): string[] {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
}

/**
 * Whether a missing setting may be named on the page: on preview deployments and locally, not in production
 * (VERCEL_ENV = "production"), where people who cannot fix it would see internals. Only names, never values.
 */
export const mayShowConfigProblems = (vercelEnv: string | undefined = process.env.VERCEL_ENV) => vercelEnv !== "production";
