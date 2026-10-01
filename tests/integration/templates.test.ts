/**
 * Process templates (migration 0019): members read their lender's templates; owners and analysts write them, viewers
 * cannot; other lenders see nothing. A case can only point at a template of its own lender, and its template and own
 * layout are readable by the lender.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, makeLender, must, TEST_ANON, TEST_URL } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
let viewer: SupabaseClient; // viewer of lender A
let templateA: string;
let templateB: string;

const tpl = (lenderId: string, name: string) => ({ lender_id: lenderId, name, requirements: [{ kind: "cirbe", level: "required", maxAgeDays: null }] });

beforeAll(async () => {
  A = await makeLender("Fondo Plantillas A");
  B = await makeLender("Fondo Plantillas B");
  const email = `viewer-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const u = must<{ user: { id: string } }>(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  must(await admin.from("lender_members").insert({ lender_id: A.lenderId, user_id: u.user.id, role: "viewer" }));
  viewer = createClient(TEST_URL, TEST_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await viewer.auth.signInWithPassword({ email, password }));
  templateA = must<{ id: string }>(await A.db.from("case_templates").insert(tpl(A.lenderId, "Factoring")).select("id").single()).id;
  templateB = must<{ id: string }>(await B.db.from("case_templates").insert(tpl(B.lenderId, "Préstamo")).select("id").single()).id;
});

describe("templates", () => {
  it("an analyst creates and edits its lender's templates", async () => {
    must(await A.db.from("case_templates").update({ name: "Factoring pyme", layout: { version: 1, modules: [{ id: "review", width: "full" }] } }).eq("id", templateA));
    const row = must<{ name: string }>(await A.db.from("case_templates").select("name").eq("id", templateA).single());
    expect(row.name).toBe("Factoring pyme");
  });

  it("a viewer reads them but cannot create, change or delete them", async () => {
    expect(must<unknown[]>(await viewer.from("case_templates").select("id").eq("lender_id", A.lenderId))).toHaveLength(1);
    expect((await viewer.from("case_templates").insert(tpl(A.lenderId, "Del lector"))).error).not.toBeNull();
    await viewer.from("case_templates").update({ name: "Cambiada" }).eq("id", templateA);
    await viewer.from("case_templates").delete().eq("id", templateA);
    expect(must<{ name: string }>(await admin.from("case_templates").select("name").eq("id", templateA).single()).name).toBe("Factoring pyme");
  });

  it("another lender neither sees nor changes them", async () => {
    expect(must<unknown[]>(await B.db.from("case_templates").select("id").eq("id", templateA))).toEqual([]);
    expect((await B.db.from("case_templates").insert(tpl(A.lenderId, "Intrusa"))).error).not.toBeNull();
    await B.db.from("case_templates").delete().eq("id", templateA);
    expect(must<unknown[]>(await admin.from("case_templates").select("id").eq("id", templateA))).toHaveLength(1);
  });

  it("rejects bad names and requirements that are not a list", async () => {
    expect((await A.db.from("case_templates").insert({ lender_id: A.lenderId, name: " ", requirements: [] })).error).not.toBeNull();
    expect((await A.db.from("case_templates").insert({ lender_id: A.lenderId, name: "Rara", requirements: { a: 1 } })).error).not.toBeNull();
  });
});

describe("cases and templates", () => {
  const newCase = (lenderId: string, extra: Record<string, unknown> = {}) =>
    admin.from("cases").insert({ lender_id: lenderId, borrower_cif: "B12345674", borrower_name: "Empresa", fiscal_year_end: "2025-12-31", borrower_token_hash: `hash-${crypto.randomUUID()}`, ...extra }).select("id").single();

  it("a case points at a template of its own lender, never another's", async () => {
    expect((await newCase(A.lenderId, { template_id: templateB })).error).not.toBeNull();
    const kase = must<{ id: string }>(await newCase(A.lenderId, { template_id: templateA }));
    expect((await A.db.from("cases").update({ template_id: templateB }).eq("id", kase.id)).error).not.toBeNull();
  });

  it("the lender reads and sets the case's template and its own layout", async () => {
    const kase = must<{ id: string }>(await newCase(A.lenderId, { template_id: templateA }));
    must(await A.db.from("cases").update({ layout: { version: 1, modules: [{ id: "kpis", width: "full" }] } }).eq("id", kase.id));
    const row = must<{ template_id: string; layout: { modules: { id: string }[] } }>(await A.db.from("cases").select("template_id, layout").eq("id", kase.id).single());
    expect(row.template_id).toBe(templateA);
    expect(row.layout.modules[0].id).toBe("kpis");
  });

  it("deleting a template leaves its cases without one", async () => {
    const t = must<{ id: string }>(await A.db.from("case_templates").insert(tpl(A.lenderId, "Temporal")).select("id").single());
    const kase = must<{ id: string }>(await newCase(A.lenderId, { template_id: t.id }));
    must(await A.db.from("case_templates").delete().eq("id", t.id));
    expect(must<{ template_id: string | null }>(await admin.from("cases").select("template_id").eq("id", kase.id).single()).template_id).toBeNull();
  });
});
