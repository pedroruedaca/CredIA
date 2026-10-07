/**
 * «Preguntar al caso» (migration 0022): a thread is private to its analyst, even inside the team; conclusions belong
 * to the case (every member reads them) and only owners and analysts write them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst of lender A, owns the thread
let colleague: { db: SupabaseClient; userId: string }; // another analyst of lender A
let viewer: { db: SupabaseClient; userId: string }; // a viewer of lender A
let caseId: string;

async function member(lenderId: string, role: "analyst" | "viewer") {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: lenderId, user_id: u.user.id, role }));
  const db = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await db.auth.signInWithPassword({ email, password }));
  return { db, userId: u.user.id };
}

beforeAll(async () => {
  A = await makeLender("Fondo Chat A");
  colleague = await member(A.lenderId, "analyst");
  viewer = await member(A.lenderId, "viewer");
  caseId = (must(await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa Chat", borrower_token_hash: `hash-${crypto.randomUUID()}` }).select("id").single()) as { id: string }).id;
});

describe("analyst threads", () => {
  it("the analyst writes and reads their own thread", async () => {
    must(await A.db.from("analyst_messages").insert({ case_id: caseId, lender_id: A.lenderId, role: "user", content: "¿Cuál es el EBITDA?" }));
    const rows = must<{ user_id: string }[]>(await A.db.from("analyst_messages").select("user_id").eq("case_id", caseId));
    expect(rows).toEqual([{ user_id: A.userId }]); // user_id defaults to the signed-in analyst
  });

  it("a colleague of the same lender neither reads, writes into nor deletes it", async () => {
    expect(must<unknown[]>(await colleague.db.from("analyst_messages").select("id").eq("case_id", caseId))).toEqual([]);
    const { error } = await colleague.db.from("analyst_messages").insert({ case_id: caseId, lender_id: A.lenderId, user_id: A.userId, role: "assistant", content: "suplantado" });
    expect(error).not.toBeNull();
    await colleague.db.from("analyst_messages").delete().eq("case_id", caseId);
    expect(must<unknown[]>(await admin.from("analyst_messages").select("id").eq("case_id", caseId))).toHaveLength(1);
  });

  it("a viewer may ask (their own thread)", async () => {
    must(await viewer.db.from("analyst_messages").insert({ case_id: caseId, lender_id: A.lenderId, role: "user", content: "¿Y la CIRBE?" }));
    expect(must<unknown[]>(await viewer.db.from("analyst_messages").select("id").eq("case_id", caseId))).toHaveLength(1);
  });
});

describe("conclusions", () => {
  it("an analyst saves one and the whole team reads it; a viewer cannot write or remove", async () => {
    must(await A.db.from("case_conclusions").insert({ case_id: caseId, lender_id: A.lenderId, text: "La deuda CIRBE es 245.000 € [[ref:raaaaaaaa]].", citations: [{ h: "raaaaaaaa", label: "CIRBE", sourceRef: "doc:x:page:2", href: null }] }));
    expect(must<unknown[]>(await colleague.db.from("case_conclusions").select("id").eq("case_id", caseId))).toHaveLength(1);
    expect(must<unknown[]>(await viewer.db.from("case_conclusions").select("id").eq("case_id", caseId))).toHaveLength(1);
    expect((await viewer.db.from("case_conclusions").insert({ case_id: caseId, lender_id: A.lenderId, text: "del lector" })).error).not.toBeNull();
    await viewer.db.from("case_conclusions").delete().eq("case_id", caseId);
    expect(must<unknown[]>(await admin.from("case_conclusions").select("id").eq("case_id", caseId))).toHaveLength(1);
    // A colleague analyst can remove it (it belongs to the case, not to its author).
    must(await colleague.db.from("case_conclusions").delete().eq("case_id", caseId));
    expect(must<unknown[]>(await admin.from("case_conclusions").select("id").eq("case_id", caseId))).toHaveLength(0);
  });
});
