/**
 * Lender team: list members with their emails, find or create a user by email. Server-only: emails live in
 * auth.users, which only the service role can read. Callers must check the acting user's role first.
 */
import "server-only";
import { createAdminClient } from "./supabase/admin.ts";

export type Role = "owner" | "analyst" | "viewer";
export const ROLES: Role[] = ["owner", "analyst", "viewer"];

export interface Member {
  userId: string;
  email: string;
  role: Role;
  lastSignInAt: string | null;
}

export async function listMembers(lenderId: string): Promise<Member[]> {
  const db = createAdminClient();
  const { data } = await db.from("lender_members").select("user_id, role").eq("lender_id", lenderId);
  const members = await Promise.all(
    (data ?? []).map(async (m) => {
      const u = (await db.auth.admin.getUserById(m.user_id)).data.user;
      return { userId: m.user_id, email: u?.email ?? "(sin correo)", role: m.role as Role, lastSignInAt: u?.last_sign_in_at ?? null };
    }),
  );
  const order = { owner: 0, analyst: 1, viewer: 2 } as const;
  return members.sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
}

/** Existing auth user with this email, or a new confirmed one (they sign in with a magic link). */
export async function findOrCreateUser(email: string): Promise<{ userId: string; created: boolean } | { error: string }> {
  const db = createAdminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error: "No hemos podido consultar los usuarios." };
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return { userId: found.id, created: false };
    if (data.users.length < 1000) break;
  }
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) return { error: "No hemos podido crear el usuario." };
  return { userId: data.user.id, created: true };
}
