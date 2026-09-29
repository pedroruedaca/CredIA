/**
 * Connection to the LOCAL Supabase stack for integration tests. Reads SUPABASE_TEST_* env vars, or asks the
 * Supabase CLI (`npx supabase status`). Refuses anything that is not localhost: these tests create and delete data.
 */
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function fromCli(): { url: string; anon: string; service: string } | null {
  try {
    const out = execSync("npx supabase status -o json", { stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }).toString();
    const j = JSON.parse(out.slice(out.indexOf("{")));
    return { url: j.API_URL, anon: j.ANON_KEY, service: j.SERVICE_ROLE_KEY };
  } catch {
    return null;
  }
}

const cfg =
  process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_KEY
    ? { url: process.env.SUPABASE_TEST_URL, anon: process.env.SUPABASE_TEST_ANON_KEY, service: process.env.SUPABASE_TEST_SERVICE_KEY }
    : fromCli();

if (!cfg) throw new Error("No local Supabase: run `npx supabase start` (or set SUPABASE_TEST_URL / _ANON_KEY / _SERVICE_KEY).");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(cfg.url)) {
  throw new Error(`Integration tests only run against a local Supabase, not ${cfg.url}.`);
}

export const TEST_URL = cfg.url;
export const TEST_ANON = cfg.anon;
export const TEST_SERVICE = cfg.service;

// App modules (createAdminClient) read these.
process.env.NEXT_PUBLIC_SUPABASE_URL = cfg.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = cfg.anon;
process.env.SUPABASE_SERVICE_ROLE_KEY = cfg.service;

export const admin: SupabaseClient = createClient(cfg.url, cfg.service, { auth: { persistSession: false, autoRefreshToken: false } });

export const must = <T = unknown>(r: { data: unknown; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

/** A lender with one signed-in analyst; `db` is that user's RLS client, exactly what the app uses. */
export async function makeLender(name: string) {
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true })) as { user: { id: string } };
  const lender = must(await admin.from("lenders").insert({ name }).select("id").single()) as { id: string };
  must(await admin.from("lender_members").insert({ lender_id: lender.id, user_id: user.user.id, role: "analyst" }));
  const db = createClient(cfg!.url, cfg!.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await db.auth.signInWithPassword({ email, password }));
  return { lenderId: lender.id, userId: user.user.id, email, db };
}

export const anonClient = () => createClient(cfg!.url, cfg!.anon, { auth: { persistSession: false, autoRefreshToken: false } });
