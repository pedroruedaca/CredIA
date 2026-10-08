/**
 * «Cerrar caso» and the retention settings against the real database (0025): who can close and reopen, the
 * archived ↔ closed_at constraint, who sets the lender's periods, and the activity query the daily cron reads.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { closeUpdate, inactiveCases, reopenUpdate, type OpenCaseActivity } from "../../src/lib/cases/closing.ts";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst
let owner: SupabaseClient;
let viewer: SupabaseClient;

async function member(lenderId: string, role: "owner" | "viewer") {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: lenderId, user_id: u.user.id, role }));
  const db = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await db.auth.signInWithPassword({ email, password }));
  return db;
}

const newCase = async (extra: Record<string, unknown> = {}) =>
  (must(await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa Cierre", ...extra }).select("id").single()) as { id: string }).id;

const row = async (id: string) => must<{ status: string; closed_at: string | null; closed_reason: string | null }>(await admin.from("cases").select("status, closed_at, closed_reason").eq("id", id).single());

beforeAll(async () => {
  A = await makeLender("Fondo Cierre A");
  owner = await member(A.lenderId, "owner");
  viewer = await member(A.lenderId, "viewer");
});

describe("closing and reopening", () => {
  it("an analyst closes and reopens with their own session; a viewer cannot", async () => {
    const id = await newCase();
    await viewer.from("cases").update(closeUpdate("declined")).eq("id", id);
    expect((await row(id)).status).toBe("awaiting_documents");

    must(await A.db.from("cases").update(closeUpdate("declined")).eq("id", id).select("id"));
    expect(await row(id)).toMatchObject({ status: "archived", closed_reason: "declined" });
    expect((await row(id)).closed_at).not.toBeNull();

    must(await A.db.from("cases").update(reopenUpdate(null)).eq("id", id).select("id"));
    expect(await row(id)).toEqual({ status: "awaiting_documents", closed_at: null, closed_reason: null });
  });

  it("status and closed_at always agree, and only known reasons are stored", async () => {
    const id = await newCase();
    expect((await admin.from("cases").update({ status: "archived" }).eq("id", id)).error).not.toBeNull();
    expect((await admin.from("cases").update({ closed_at: new Date().toISOString() }).eq("id", id)).error).not.toBeNull();
    expect((await admin.from("cases").update({ ...closeUpdate("declined"), closed_reason: "approved" }).eq("id", id)).error).not.toBeNull();
  });
});

describe("retention settings", () => {
  it("default to 12 months kept and 6 months to auto-close; owners change them, analysts cannot", async () => {
    expect(must(await admin.from("lenders").select("retention_months, auto_close_months").eq("id", A.lenderId).single())).toEqual({ retention_months: 12, auto_close_months: 6 });
    await A.db.from("lenders").update({ retention_months: 120 }).eq("id", A.lenderId);
    expect((must(await admin.from("lenders").select("retention_months").eq("id", A.lenderId).single()) as { retention_months: number }).retention_months).toBe(12);
    must(await owner.from("lenders").update({ retention_months: 24, auto_close_months: null }).eq("id", A.lenderId).select("id"));
    expect(must(await admin.from("lenders").select("retention_months, auto_close_months").eq("id", A.lenderId).single())).toEqual({ retention_months: 24, auto_close_months: null });
    expect((await owner.from("lenders").update({ retention_months: 0 }).eq("id", A.lenderId)).error).not.toBeNull();
    must(await admin.from("lenders").update({ retention_months: 12, auto_close_months: 6 }).eq("id", A.lenderId));
  });
});

describe("open_case_activity", () => {
  it("is for the service role only", async () => {
    expect((await A.db.rpc("open_case_activity")).error).not.toBeNull();
  });

  it("counts people's actions, not the system's, and the cron rule closes only idle cases", async () => {
    const idle = await newCase({ created_at: "2025-01-01T00:00:00Z" });
    const busy = await newCase({ created_at: "2025-01-01T00:00:00Z" });
    must(await admin.from("audit_log").insert([
      { lender_id: A.lenderId, case_id: idle, actor: "system", action: "pipeline.recomputed", detail: {} },
      { lender_id: A.lenderId, case_id: busy, actor: "borrower", action: "document.uploaded", detail: {} },
    ]));
    const rows = must<OpenCaseActivity[]>(await admin.rpc("open_case_activity")).filter((r) => r.case_id === idle || r.case_id === busy);
    expect(new Date(rows.find((r) => r.case_id === idle)!.last_activity).toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(inactiveCases(rows).map((r) => r.case_id)).toEqual([idle]);
  });
});
