/**
 * Policy parameters (migrations 0031/0032): values the analyst enters on each case. Members read their lender's
 * parameters and case values; owners and analysts write them, viewers cannot; other lenders see nothing. A case value
 * must be for a parameter of the case's own lender; deleting the parameter removes its values.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
let viewer: SupabaseClient; // viewer of lender A
let caseA: string;
let amountA: string;
let amountB: string;

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
  amountA = must<{ id: string }>(await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Importe solicitado", unit: "EUR" }).select("id").single()).id;
  amountB = must<{ id: string }>(await B.db.from("policy_parameters").insert({ lender_id: B.lenderId, name: "Importe solicitado", unit: "EUR" }).select("id").single()).id;
});

describe("policy parameters", () => {
  it("names are unique per lender (case and spaces ignored); units are the KPIs'", async () => {
    expect((await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: " importe SOLICITADO ", unit: "EUR" })).error?.code).toBe("23505");
    expect((await A.db.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Distancia", unit: "km" })).error).not.toBeNull();
  });

  it("a viewer reads them but cannot create, change or delete them; another lender sees nothing", async () => {
    expect(must<unknown[]>(await viewer.from("policy_parameters").select("id").eq("lender_id", A.lenderId))).toHaveLength(1);
    expect((await viewer.from("policy_parameters").insert({ lender_id: A.lenderId, name: "Del lector", unit: "x" })).error).not.toBeNull();
    await viewer.from("policy_parameters").update({ name: "Cambiado" }).eq("id", amountA);
    await viewer.from("policy_parameters").delete().eq("id", amountA);
    expect(must<{ name: string }>(await admin.from("policy_parameters").select("name").eq("id", amountA).single()).name).toBe("Importe solicitado");
    expect(must<unknown[]>(await B.db.from("policy_parameters").select("id").eq("id", amountA))).toEqual([]);
  });

  it("an analyst sets a case's value; only for its own lender's parameters, once per case", async () => {
    must(await A.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountA, value: 250000 }));
    expect(must<{ value: number }>(await A.db.from("case_parameter_values").select("value").eq("case_id", caseA).single()).value).toBe(250000);
    expect((await admin.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountB, value: 2 })).error).not.toBeNull();
    expect((await A.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: A.lenderId, parameter_id: amountA, value: 1 })).error).not.toBeNull();
  });

  it("a viewer reads the case's values but cannot change them; another lender sees nothing", async () => {
    expect(must<unknown[]>(await viewer.from("case_parameter_values").select("id").eq("case_id", caseA))).toHaveLength(1);
    await viewer.from("case_parameter_values").update({ value: 1 }).eq("case_id", caseA);
    expect(must<{ value: number }>(await admin.from("case_parameter_values").select("value").eq("case_id", caseA).single()).value).toBe(250000);
    expect(must<unknown[]>(await B.db.from("case_parameter_values").select("id").eq("case_id", caseA))).toEqual([]);
    expect((await B.db.from("case_parameter_values").insert({ case_id: caseA, lender_id: B.lenderId, parameter_id: amountB, value: 1 })).error).not.toBeNull();
  });

  it("deleting a parameter removes its values", async () => {
    must(await A.db.from("policy_parameters").delete().eq("id", amountA));
    expect(must<unknown[]>(await admin.from("case_parameter_values").select("id").eq("case_id", caseA))).toEqual([]);
  });
});
