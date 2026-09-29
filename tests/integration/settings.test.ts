/**
 * Ajustes (migration 0009): teammates are visible to members only; only owners can edit their lender, and only
 * its name and brand colour; nobody can write memberships from the client. Bandeja: members close help requests.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst of lender A
let owner: { userId: string; db: SupabaseClient };
let B: Lender;

beforeAll(async () => {
  A = await makeLender("Fondo Ajustes A");
  B = await makeLender("Fondo Ajustes B");
  const email = `owner-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "owner" }));
  const db = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await db.auth.signInWithPassword({ email, password }));
  owner = { userId: u.user.id, db };
});

describe("team visibility", () => {
  it("members see their teammates, not other lenders' members", async () => {
    const mine = must<{ user_id: string }[]>(await A.db.from("lender_members").select("user_id").eq("lender_id", A.lenderId));
    expect(mine.map((m) => m.user_id).sort()).toEqual([A.userId, owner.userId].sort());
    expect(must<unknown[]>(await B.db.from("lender_members").select("user_id").eq("lender_id", A.lenderId))).toEqual([]);
  });
  it("nobody writes memberships from the client, owners included", async () => {
    expect((await owner.db.from("lender_members").insert({ lender_id: A.lenderId, user_id: B.userId, role: "viewer" })).error).not.toBeNull();
    await owner.db.from("lender_members").update({ role: "owner" }).eq("user_id", A.userId);
    await owner.db.from("lender_members").delete().eq("user_id", A.userId);
    const a = must<{ role: string } | null>(await admin.from("lender_members").select("role").eq("user_id", A.userId).eq("lender_id", A.lenderId).maybeSingle());
    expect(a?.role).toBe("analyst");
  });
});

describe("lender settings", () => {
  it("owners update name and brand colour", async () => {
    const r = await owner.db.from("lenders").update({ name: "Fondo Ajustes A2", brand_color: "#0E5A61" }).eq("id", A.lenderId).select("name, brand_color");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ name: "Fondo Ajustes A2", brand_color: "#0E5A61" }]);
  });
  it("analysts cannot, and nobody edits another lender", async () => {
    const r = await A.db.from("lenders").update({ name: "Hacked" }).eq("id", A.lenderId).select("id");
    expect(r.data ?? []).toEqual([]);
    await B.db.from("lenders").update({ name: "Hacked" }).eq("id", A.lenderId);
    const l = must<{ name: string }>(await admin.from("lenders").select("name").eq("id", A.lenderId).single());
    expect(l.name).not.toBe("Hacked");
  });
  it("only name and brand colour are writable", async () => {
    expect((await owner.db.from("lenders").update({ created_at: "2000-01-01T00:00:00Z" }).eq("id", A.lenderId)).error).not.toBeNull();
    expect((await owner.db.from("lenders").update({ brand_color: "red" }).eq("id", A.lenderId)).error).not.toBeNull();
    expect((await owner.db.from("lenders").update({ name: " " }).eq("id", A.lenderId)).error).not.toBeNull();
  });
});

describe("bandeja", () => {
  it("a member closes their lender's help request; another lender cannot", async () => {
    const kase = must<{ id: string }>(await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa" }).select("id").single());
    const req = must<{ id: string }>(await admin.from("support_requests").insert({ case_id: kase.id, lender_id: A.lenderId, actor: "borrower", message: "ayuda" }).select("id").single());
    await B.db.from("support_requests").update({ status: "closed" }).eq("id", req.id);
    expect(must<{ status: string }>(await admin.from("support_requests").select("status").eq("id", req.id).single()).status).toBe("open");
    const r = await A.db.from("support_requests").update({ status: "closed" }).eq("id", req.id).select("status");
    expect(r.data).toEqual([{ status: "closed" }]);
  });
});
