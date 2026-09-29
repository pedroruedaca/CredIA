/** Local Supabase connection for the e2e run (same rules as the integration tests: localhost only). */
import { execSync } from "node:child_process";

export function localSupabase(): { url: string; anon: string; service: string } {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, anon: process.env.SUPABASE_TEST_ANON_KEY, service: process.env.SUPABASE_TEST_SERVICE_KEY };
  }
  const out = execSync("npx supabase status -o json", { stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }).toString();
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const cfg = { url: j.API_URL as string, anon: j.ANON_KEY as string, service: j.SERVICE_ROLE_KEY as string };
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(cfg.url)) throw new Error(`E2E only runs against a local Supabase, not ${cfg.url}`);
  return cfg;
}
