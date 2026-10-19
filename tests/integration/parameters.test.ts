/**
 * Policy parameters (migration 0031): members read their lender's parameters and per-case values; owners and analysts
 * write them, viewers cannot; other lenders see nothing. A fixed parameter carries its value, a per-case one does not.
 * A case value must be for a per-case parameter of the case's own lender; deleting the parameter removes its values.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
let viewer: SupabaseClient; // viewer of lender A
let caseA: string;
let amountA: string; // per case, lender A
let dscrA: string; // fixed, lender A
let amountB: string; // per case, lender B

const newCase = (lenderId: string) =>
  admin.from("cases").insert({ lender_id: lenderId, borrower_cif: "B12345674", borrower_name: "Empresa", fiscal_year_end: "2025-12-31", borrower_token_hash: `hash-${crypto.randomUUID()}` }).select("id").single();

beforeAll(async () => {
  A = await makeLender("Fondo Parámetros A");
  B = await makeLender("Fondo Parámetros B");
  const email = `viewer-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "viewer" }));
  viewer = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await viewer.auth.signInWithPassword({ email, password }));
  caseA = must<{ id: string }>(await newCase(A.lenderId)).id;
  amountA = must<{ id: string }>(await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Importe solicitado", unit: "EUR", scope: "case" }).select("id").single()).id;
  dscrA = must<{ id: string }>(await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "DSCR mínimo", unit: "x", scope: "fixed", value: 1.25 }).select("id").single()).id;
  amountB = must<{ id: string }>(await B.db.from("policy_parameters").insert({ lender_id: B.lenderId, name: "Importe solicitado", unit: "EUR", scope: "case" }).select("id").single()).id;
});

describe("policy parameters", () => {
  it("a fixed parameter needs its value and a per-case one cannot have one; names are unique per lender", async () => {
    expect((await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Sin valor", unit: "x", scope: "fixed" })).error).not.toBeNull();
    expect((await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Con valor", unit: "EUR", scope: "case", value: 5 })).error).not.toBeNull();
    expect((await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: " importe SOLICITADO ", unit: "EUR", scope: "case" })).error?.code).toBe("23505");
  });

  it("a viewer reads them but cannot create, change or delete them; another lender sees nothing", async () => {
    expect(must<unknown[]>(await viewer.from("policy_parameters").select("id").eq("lender_id", A.lenderId))).toHaveLength(2);
    expect((await viewer.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Del lector", unit: "x", scope: "fixed", value: 1 })).error).not.toBeNull();
    await viewer.from("policy_parameters").update({ value: 9 }).eq("id", dscrA);
    await viewer.from("policy_parameters").delete().eq("id", dscrA);
    expect(must<{ value: number }>(await admin.from("policy_parameters").select("value").eq("id", dscrA).single()).value).toBe(1.25);
    expect(must<unknown[]>(await B.db.from("policy_parameters").select("id").eq("id", amountA))).toEqual([]);
  });

  it("an analyst sets a case's value; only for its own lender's per-case parameters", async () => {
    must(await A.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountA, value: 250000 }));
    expect(must<{ value: number }>(await A.db.from("case_parameter_values").select("value").eq("case_id", caseA).single()).value).toBe(250000);
    // A fixed parameter has no per-case values; another lender's parameter cannot be used.
    expect((await A.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: dscrA, value: 2 })).error).not.toBeNull();
    expect((await admin.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountB, value: 2 })).error).not.toBeNull();
    // One value per case and parameter.
    expect((await A.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountA, value: 1 })).error).not.toBeNull();
  });

  it("a viewer reads the case's values but cannot change them; another lender sees nothing", async () => {
    expect(must<unknown[]>(await viewer.from("case_parameter_values").select("id").eq("case_id", caseA))).toHaveLength(1);
    await viewer.from("case_parameter_values").update({ value: 1 }).eq("case_id", caseA);
    expect(must<{ value: number }>(await admin.from("case_parameter_values").select("value").eq("case_id", caseA).single()).value).toBe(250000);
    expect(must<unknown[]>(await B.db.from("case_parameter_values").select("id").eq("case_id", caseA))).toEqual([]);
    expect((await B.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: B.lenderId, parameter_id: amountB, value: 1 })).error).not.toBeNull();
  });

  it("deleting a per-case parameter removes its values", async () => {
    must(await A.db.from("policy_parameters").delete().eq("id", amountA));
    expect(must<unknown[]>(await admin.from("case_parameter_values").select("id").eq("case_id", caseA))).toEqual([]);
  });
});
