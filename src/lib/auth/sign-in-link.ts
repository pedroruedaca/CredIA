/**
 * Makes the sign-in link for a welcome or team-invitation email (see signInLinkUrl). Server-only: uses the service role.
 * generateLink sends nothing itself; the token is a Supabase magic link, valid SIGN_IN_LINK_HOURS, and any newer
 * sign-in email for the same person replaces it. Null when Supabase refuses: the email then falls back to /login.
 */
import "server-only";
import { createAdminClient } from "../supabase/admin.ts";
import { signInLinkUrl } from "./login.ts";

export async function createSignInLink(email: string, baseUrl: string): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.error(`[auth] sign-in link not created: ${error?.code ?? error?.name ?? "no token"}`);
    return null;
  }
  return signInLinkUrl(baseUrl, token);
}
