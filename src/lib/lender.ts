/** Resolves the signed-in user's lender membership. Server-only. */
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server.ts";

export interface LenderContext {
  userId: string;
  email: string;
  lenderId: string;
  lenderName: string;
  role: "owner" | "analyst" | "viewer";
}

export async function getLenderContext(): Promise<LenderContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("lender_members")
    .select("lender_id, role, lenders(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const lender = data.lenders as unknown as { name: string } | null;
  return {
    userId: user.id,
    email: user.email ?? "",
    lenderId: data.lender_id,
    lenderName: lender?.name ?? "",
    role: data.role,
  };
}

/** For lender pages: signed-out → /login, signed in without a lender → /sin-acceso. */
export async function requireLender(): Promise<LenderContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await getLenderContext();
  if (!ctx) redirect("/sin-acceso");
  return ctx;
}

/** Re-exported for existing server imports; the helper itself is pure (client-safe) in ./initials.ts. */
export { initials } from "./initials.ts";
