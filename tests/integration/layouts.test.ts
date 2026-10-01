/**
 * Case-view layouts (migration 0018): one team layout per lender. Members read their own lender's; owners and
 * analysts write it, viewers cannot; nobody reads or writes another lender's.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst of lender A
let B: Lender; // analyst of lender B
let viewer: SupabaseClient; // viewer of lender A

const layout = (ids: string[]) => ({ version: 1, modules: ids.map((id) => ({ id, width: "full" })) });

beforeAll(async () => {
  A = await makeLender("Fondo Paneles A");
  B = await makeLender("Fondo Paneles B");
  const email = `viewer-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "viewer" }));
  viewer = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await viewer.auth.signInWithPassword({ email, password }));
});

describe("team layout", () => {
  it("an analyst saves the team layout and changes it again (one row per lender)", async () => {
    must(await A.db.from("dashboard_layouts").upsert({ lender_id: A.lenderId, scope: "team", layout: layout(["review", "kpis"]), updated_by: A.userId }, { onConflict: "lender_id,scope" }));
    must(await A.db.from("dashboard_layouts").upsert({ lender_id: A.lenderId, scope: "team", layout: layout(["kpis", "review"]), updated_by: A.userId }, { onConflict: "lender_id,scope" }));
    const rows = must<{ layout: { modules: { id: string }[] } }[]>(await A.db.from("dashboard_layouts").select("layout").eq("lender_id", A.lenderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].layout.modules.map((m) => m.id)).toEqual(["kpis", "review"]);
  });

  it("a viewer reads it but cannot change it", async () => {
    expect(must<unknown[]>(await viewer.from("dashboard_layouts").select("id").eq("lender_id", A.lenderId))).toHaveLength(1);
    await viewer.from("dashboard_layouts").update({ layout: layout(["review"]) }).eq("lender_id", A.lenderId);
    await viewer.from("dashboard_layouts").delete().eq("lender_id", A.lenderId);
    const row = must<{ layout: { modules: { id: string }[] } }>(await admin.from("dashboard_layouts").select("layout").eq("lender_id", A.lenderId).single());
    expect(row.layout.modules.map((m) => m.id)).toEqual(["kpis", "review"]);
  });

  it("another lender neither reads nor writes it", async () => {
    expect(must<unknown[]>(await B.db.from("dashboard_layouts").select("id").eq("lender_id", A.lenderId))).toEqual([]);
    expect((await B.db.from("dashboard_layouts").insert({ lender_id: A.lenderId, scope: "team", layout: layout(["review"]) })).error).not.toBeNull();
    await B.db.from("dashboard_layouts").update({ layout: layout(["review"]) }).eq("lender_id", A.lenderId);
    const row = must<{ layout: { modules: { id: string }[] } }>(await admin.from("dashboard_layouts").select("layout").eq("lender_id", A.lenderId).single());
    expect(row.layout.modules.map((m) => m.id)).toEqual(["kpis", "review"]);
  });

  it("rejects something that is not a layout object", async () => {
    expect((await B.db.from("dashboard_layouts").insert({ lender_id: B.lenderId, scope: "team", layout: [1, 2] })).error).not.toBeNull();
    expect((await B.db.from("dashboard_layouts").insert({ lender_id: B.lenderId, scope: "other", layout: layout([]) })).error).not.toBeNull();
  });
});
