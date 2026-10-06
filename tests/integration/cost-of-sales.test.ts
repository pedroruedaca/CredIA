/**
 * Cost of sales for the adjusted gross margin (migration 0021): owners and analysts write a case's definition,
 * viewers read it but cannot change it, other lenders see nothing. A template keeps a default definition.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
let viewer: SupabaseClient; // viewer of lender A
let caseA: string;

const def = { preset: "services", selectors: ["line:cogs", "line:personnel", "623"] };

beforeAll(async () => {
  A = await makeLender("Fondo Coste A");
  B = await makeLender("Fondo Coste B");
  const email = `viewer-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "viewer" }));
  viewer = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await viewer.auth.signInWithPassword({ email, password }));
  caseA = must<{ id: string }>(
    await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa A", borrower_token_hash: `hash-${crypto.randomUUID()}` }).select("id").single(),
  ).id;
});

describe("case cost-of-sales definitions", () => {
  it("an analyst saves and changes one per case", async () => {
    must(await A.db.from("case_cost_definitions").upsert({ case_id: caseA, lender_id: A.lenderId, ...def, updated_by: A.userId }, { onConflict: "case_id" }).select("id"));
    must(await A.db.from("case_cost_definitions").upsert({ case_id: caseA, lender_id: A.lenderId, preset: "trading", selectors: ["line:cogs"] }, { onConflict: "case_id" }).select("id"));
    expect(must<{ preset: string }[]>(await A.db.from("case_cost_definitions").select("preset").eq("case_id", caseA))).toEqual([{ preset: "trading" }]);
  });

  it("a viewer reads it but cannot change or remove it", async () => {
    expect(must<unknown[]>(await viewer.from("case_cost_definitions").select("id").eq("case_id", caseA))).toHaveLength(1);
    await viewer.from("case_cost_definitions").update({ preset: "custom" }).eq("case_id", caseA);
    await viewer.from("case_cost_definitions").delete().eq("case_id", caseA);
    expect(must<{ preset: string }>(await admin.from("case_cost_definitions").select("preset").eq("case_id", caseA).single()).preset).toBe("trading");
  });

  it("another lender neither sees nor writes it", async () => {
    expect(must<unknown[]>(await B.db.from("case_cost_definitions").select("id").eq("case_id", caseA))).toEqual([]);
    expect((await B.db.from("case_cost_definitions").insert({ case_id: caseA, lender_id: B.lenderId, ...def })).error).not.toBeNull();
  });

  it("rejects unknown presets and empty selections", async () => {
    await admin.from("case_cost_definitions").delete().eq("case_id", caseA);
    expect((await A.db.from("case_cost_definitions").insert({ case_id: caseA, lender_id: A.lenderId, preset: "scoring", selectors: ["line:cogs"] })).error).not.toBeNull();
    expect((await A.db.from("case_cost_definitions").insert({ case_id: caseA, lender_id: A.lenderId, preset: "custom", selectors: [] })).error).not.toBeNull();
  });

  it("a template keeps a default definition", async () => {
    const t = must<{ id: string }>(await A.db.from("case_templates").insert({ lender_id: A.lenderId, name: "Servicios", requirements: [], cost_of_sales: def }).select("id").single());
    expect(must<{ cost_of_sales: unknown }>(await viewer.from("case_templates").select("cost_of_sales").eq("id", t.id).single()).cost_of_sales).toEqual(def);
  });
});
