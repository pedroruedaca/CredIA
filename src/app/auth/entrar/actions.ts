"use server";

/** «Entrar» on /auth/entrar: spends the emailed token (Supabase magic link) for a session, then on to the cases. */
import { redirect } from "next/navigation";
import { linkError } from "@/lib/auth/login";
import { createClient } from "@/lib/supabase/server";

export async function enterWithToken(token: string): Promise<void> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) redirect("/login?error=expired");
  const { error } = await (await createClient()).auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) redirect(`/login?error=${linkError(error as { code?: string; message?: string; name?: string })}`);
  redirect("/casos");
}
