/**
 * Service-role client. Bypasses RLS: use only in server routes that authorise the caller themselves
 * (borrower magic-link routes, seed scripts). Never import from client code.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv, supabaseUrl } from "../env.ts";

export function createAdminClient() {
  return createClient(supabaseUrl(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
