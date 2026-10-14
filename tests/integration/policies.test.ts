/**
 * Credit policies (migration 0029): members read their lender's policies; owners and analysts write them, viewers
 * cannot; other lenders see nothing. A case can only point at a policy of its own lender; deleting the policy leaves
 * the case without one.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
let viewer: SupabaseClient; // viewer of lender A
let policyA: string;
let policyB: string;

const pol = (lenderId: string, name: string) => ({ lender_id: lenderId, name, criteria: [{ metric: "dscr", op: "gte", threshold: 1.25, period: "base" }] });
const newCase = (lenderId: string, extra: Record<string, unknown> = {}) =>
  admin.from("cases").insert({ lender_id: lenderId, borrower_cif: "B12345674", borrower_name: "Empresa", fiscal_year_end: "2025-12-31", borrower_token_hash: `hash-${crypto.randomUUID()}`, ...extra }).select("id").single();

beforeAll(async () => {
  A = await makeLender("Fondo Políticas A");
  B = await makeLender("Fondo Políticas B");
  const email = `viewer-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "viewer" }));
  viewer = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await viewer.auth.signInWithPassword({ email, password }));
  policyA = must<{ id: string }>(await A.db.from("credit_policies").insert(pol(A.lenderId, "Factoring")).select("id").single()).id;
  policyB = must<{ id: string }>(await B.db.from("credit_policies").insert(pol(B.lenderId, "Préstamo")).select("id").single()).id;
});

describe("credit policies", () => {
  it("an analyst creates and edits its lender's policies", async () => {
    must(await A.db.from("credit_policies").update({ name: "Factoring pyme" }).eq("id", policyA));
    expect(must<{ name: string }>(await A.db.from("credit_policies").select("name").eq("id", policyA).single()).name).toBe("Factoring pyme");
  });

  it("a viewer reads them but cannot create, change or delete them", async () => {
    expect(must<unknown[]>(await viewer.from("credit_policies").select("id").eq("lender_id", A.lenderId))).toHaveLength(1);
    expect((await viewer.from("credit_policies").insert(pol(A.lenderId, "Del lector"))).error).not.toBeNull();
    await viewer.from("credit_policies").update({ name: "Cambiada" }).eq("id", policyA);
    await viewer.from("credit_policies").delete().eq("id", policyA);
    expect(must<{ name: string }>(await admin.from("credit_policies").select("name").eq("id", policyA).single()).name).toBe("Factoring pyme");
  });

  it("another lender neither sees nor changes them", async () => {
    expect(must<unknown[]>(await B.db.from("credit_policies").select("id").eq("id", policyA))).toEqual([]);
    expect((await B.db.from("credit_policies").insert(pol(A.lenderId, "Intrusa"))).error).not.toBeNull();
    await B.db.from("credit_policies").delete().eq("id", policyA);
    expect(must<unknown[]>(await admin.from("credit_policies").select("id").eq("id", policyA))).toHaveLength(1);
  });

  it("rejects bad names and criteria that are not a list", async () => {
    expect((await A.db.from("credit_policies").insert({ lender_id: A.lenderId, name: " ", criteria: [] })).error).not.toBeNull();
    expect((await A.db.from("credit_policies").insert({ lender_id: A.lenderId, name: "Rara", criteria: { a: 1 } })).error).not.toBeNull();
  });
});

describe("cases and policies", () => {
  it("an analyst applies a policy of its own lender to a case, never another's", async () => {
    const kase = must<{ id: string }>(await newCase(A.lenderId));
    must(await A.db.from("cases").update({ policy_id: policyA }).eq("id", kase.id));
    expect(must<{ policy_id: string }>(await A.db.from("cases").select("policy_id").eq("id", kase.id).single()).policy_id).toBe(policyA);
    expect((await A.db.from("cases").update({ policy_id: policyB }).eq("id", kase.id)).error).not.toBeNull();
  });

  it("a viewer cannot change the policy applied", async () => {
    const kase = must<{ id: string }>(await newCase(A.lenderId, { policy_id: policyA }));
    await viewer.from("cases").update({ policy_id: null }).eq("id", kase.id);
    expect(must<{ policy_id: string }>(await admin.from("cases").select("policy_id").eq("id", kase.id).single()).policy_id).toBe(policyA);
  });

  it("deleting a policy leaves its cases without one", async () => {
    const p = must<{ id: string }>(await A.db.from("credit_policies").insert(pol(A.lenderId, "Temporal")).select("id").single());
    const kase = must<{ id: string }>(await newCase(A.lenderId, { policy_id: p.id }));
    must(await A.db.from("credit_policies").delete().eq("id", p.id));
    expect(must<{ policy_id: string | null }>(await admin.from("cases").select("policy_id").eq("id", kase.id).single()).policy_id).toBeNull();
  });
});

describe("templates and policies (0030)", () => {
  const tpl = (lenderId: string, extra: Record<string, unknown> = {}) => ({ lender_id: lenderId, name: "Con política", requirements: [], ...extra });

  it("a template's default policy is one of its own lender's", async () => {
    const t = must<{ id: string }>(await A.db.from("case_templates").insert(tpl(A.lenderId, { policy_id: policyA })).select("id").single());
    expect(must<{ policy_id: string }>(await A.db.from("case_templates").select("policy_id").eq("id", t.id).single()).policy_id).toBe(policyA);
    expect((await A.db.from("case_templates").insert(tpl(A.lenderId, { policy_id: policyB }))).error).not.toBeNull();
    expect((await A.db.from("case_templates").update({ policy_id: policyB }).eq("id", t.id)).error).not.toBeNull();
  });

  it("deleting the policy leaves the template without a default", async () => {
    const p = must<{ id: string }>(await A.db.from("credit_policies").insert(pol(A.lenderId, "Para plantilla")).select("id").single());
    const t = must<{ id: string }>(await A.db.from("case_templates").insert(tpl(A.lenderId, { policy_id: p.id })).select("id").single());
    must(await A.db.from("credit_policies").delete().eq("id", p.id));
    expect(must<{ policy_id: string | null }>(await admin.from("case_templates").select("policy_id").eq("id", t.id).single()).policy_id).toBeNull();
  });
});
