/**
 * Writes by role, enforced by the database (migration 0023), with each user's own session as the app uses it:
 * viewers only read (and log their own reads), computed tables are read-only for every client, the audit log is
 * append-only and written as oneself, and only owners delete cases.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst
let owner: { db: SupabaseClient; userId: string };
let viewer: { db: SupabaseClient; userId: string };
let caseId: string;

async function member(lenderId: string, role: "owner" | "viewer") {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: lenderId, user_id: u.user.id, role }));
  const db = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await db.auth.signInWithPassword({ email, password }));
  return { db, userId: u.user.id };
}

beforeAll(async () => {
  A = await makeLender("Fondo Roles A");
  owner = await member(A.lenderId, "owner");
  viewer = await member(A.lenderId, "viewer");
  // The analyst creates the case with their own session, as «Nuevo caso» does.
  caseId = (must(await A.db.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa Roles", borrower_token_hash: `hash-${crypto.randomUUID()}` }).select("id").single()) as { id: string }).id;
  must(await admin.from("checks").insert({ case_id: caseId, lender_id: A.lenderId, check_key: "x", severity: "info", message: "real" }));
});

describe("viewers read only", () => {
  it("cannot change the case or what was requested, but their reads are logged", async () => {
    await viewer.db.from("cases").update({ borrower_name: "Cambiado" }).eq("id", caseId);
    expect((must(await admin.from("cases").select("borrower_name").eq("id", caseId).single()) as { borrower_name: string }).borrower_name).toBe("Empresa Roles");
    expect((await viewer.db.from("case_requirements").insert({ case_id: caseId, lender_id: A.lenderId, doc_kind: "cirbe", required: true })).error).not.toBeNull();
    must(await viewer.db.from("audit_log").insert({ lender_id: A.lenderId, case_id: caseId, actor: viewer.userId, action: "case.viewed", detail: {} }));
  });
});

describe("computed data and the audit log", () => {
  it("no client can write checks, documents or statements", async () => {
    expect((await A.db.from("checks").insert({ case_id: caseId, lender_id: A.lenderId, check_key: "y", severity: "info", message: "fake" })).error).not.toBeNull();
    await A.db.from("checks").update({ message: "edited" }).eq("case_id", caseId);
    await owner.db.from("checks").delete().eq("case_id", caseId);
    expect((must(await admin.from("checks").select("message").eq("case_id", caseId)) as { message: string }[])).toEqual([{ message: "real" }]);
  });

  it("is append-only and written as oneself", async () => {
    expect((await A.db.from("audit_log").insert({ lender_id: A.lenderId, case_id: caseId, actor: "system", action: "forged", detail: {} })).error).not.toBeNull();
    const before = (must(await admin.from("audit_log").select("id").eq("case_id", caseId)) as unknown[]).length;
    await owner.db.from("audit_log").delete().eq("case_id", caseId);
    await owner.db.from("audit_log").update({ action: "hidden" }).eq("case_id", caseId);
    const after = must(await admin.from("audit_log").select("action").eq("case_id", caseId)) as { action: string }[];
    expect(after).toHaveLength(before);
    expect(after.some((r) => r.action === "hidden")).toBe(false);
  });
});

describe("case columns (0024)", () => {
  it("editors change what the app's lender actions write, never consent or pipeline state", async () => {
    must(await admin.from("cases").update({ consent_withdrawn_at: new Date().toISOString() }).eq("id", caseId));
    for (const db of [A.db, owner.db]) {
      expect((await db.from("cases").update({ consent_withdrawn_at: null }).eq("id", caseId)).error).not.toBeNull();
      expect((await db.from("cases").update({ bank_kpis: { forged: true } }).eq("id", caseId)).error).not.toBeNull();
      expect((await db.from("cases").update({ borrower_cif: "A58818501" }).eq("id", caseId)).error).not.toBeNull();
    }
    const row = must(await admin.from("cases").select("consent_withdrawn_at, bank_kpis, borrower_cif").eq("id", caseId).single()) as { consent_withdrawn_at: string | null; bank_kpis: unknown; borrower_cif: string };
    expect(row.consent_withdrawn_at).not.toBeNull();
    expect(row.bank_kpis).toBeNull();
    expect(row.borrower_cif).toBe("B12345674");
    must(await A.db.from("cases").update({ status: "awaiting_documents", submitted_at: null, layout: null }).eq("id", caseId).select("id"));
    must(await admin.from("cases").update({ consent_withdrawn_at: null }).eq("id", caseId));
  });
});

describe("deleting a case", () => {
  it("only an owner can, and everything of the case goes with it", async () => {
    await A.db.from("cases").delete().eq("id", caseId);
    await viewer.db.from("cases").delete().eq("id", caseId);
    expect(must(await admin.from("cases").select("id").eq("id", caseId))).toHaveLength(1);
    must(await owner.db.from("cases").delete().eq("id", caseId).select("id"));
    expect(must(await admin.from("cases").select("id").eq("id", caseId))).toHaveLength(0);
    expect(must(await admin.from("checks").select("id").eq("case_id", caseId))).toHaveLength(0);
  });
});
