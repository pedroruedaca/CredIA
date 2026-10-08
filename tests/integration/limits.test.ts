/**
 * Audit follow-ups against the real database (0027): support requests are the company's words (analysts only mark
 * them attended), the rate-limit counter used by the company's links, and the daily sweep of abandoned uploads.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sweepOrphanUploads } from "../../src/lib/cases/orphan-uploads.ts";
import { admin, makeLender, must } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender; // analyst
let caseId: string;
const BUCKET = "case-files";

beforeAll(async () => {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  A = await makeLender("Fondo Límites");
  caseId = (must(await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa Límites" }).select("id").single()) as { id: string }).id;
});

describe("support requests", () => {
  it("analysts mark them attended but cannot rewrite, add or delete the company's message", async () => {
    const req = must<{ id: string }>(await admin.from("support_requests").insert({ case_id: caseId, lender_id: A.lenderId, actor: "borrower", message: "No encuentro el CIRBE" }).select("id").single());
    expect((await A.db.from("support_requests").update({ message: "editado" }).eq("id", req.id)).error).not.toBeNull();
    expect((await A.db.from("support_requests").insert({ case_id: caseId, lender_id: A.lenderId, actor: "borrower", message: "falso" })).error).not.toBeNull();
    await A.db.from("support_requests").delete().eq("id", req.id);
    must(await A.db.from("support_requests").update({ status: "closed" }).eq("id", req.id).select("id"));
    expect(must(await admin.from("support_requests").select("message, status").eq("id", req.id).single())).toEqual({ message: "No encuentro el CIRBE", status: "closed" });
  });
});

describe("hit_rate_limit", () => {
  it("allows up to the limit in a window, then refuses", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const hits = [];
    for (let i = 0; i < 4; i++) hits.push(must<boolean>(await admin.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 3 })));
    expect(hits).toEqual([true, true, true, false]);
  });

  it("starts a new window once the old one has passed", async () => {
    const key = `test:${crypto.randomUUID()}`;
    must(await admin.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 1 }));
    expect(must<boolean>(await admin.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 1 }))).toBe(false);
    must(await admin.from("rate_limits").update({ window_start: new Date(Date.now() - 2 * 3600_000).toISOString() }).eq("key", key));
    expect(must<boolean>(await admin.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 1 }))).toBe(true);
  });

  it("is for the service role only, and clients cannot read the counters", async () => {
    expect((await A.db.rpc("hit_rate_limit", { p_key: "x", p_window_seconds: 60, p_max: 1 })).error).not.toBeNull();
    const { data } = await A.db.from("rate_limits").select("key");
    expect(data ?? []).toEqual([]);
  });
});

describe("sweepOrphanUploads", () => {
  it("removes old files no document names, keeps registered ones", async () => {
    const kept = `cases/${caseId}/cirbe/${crypto.randomUUID()}.pdf`;
    const orphan = `cases/${caseId}/cirbe/${crypto.randomUUID()}.pdf`;
    for (const p of [kept, orphan]) must(await admin.storage.from(BUCKET).upload(p, new TextEncoder().encode("%PDF-1.4 x %%EOF"), { upsert: true }));
    must(await admin.from("documents").insert({ case_id: caseId, lender_id: A.lenderId, kind: "cirbe", storage_path: kept, sha256: crypto.randomUUID(), original_filename: "cirbe.pdf", uploaded_by: "borrower" }));

    // Just uploaded: too recent to be abandoned.
    expect(await sweepOrphanUploads(admin)).toBe(0);
    // Two hours later the unregistered one goes.
    expect(await sweepOrphanUploads(admin, Date.now() + 2 * 3600_000)).toBeGreaterThanOrEqual(1);
    const names = ((await admin.storage.from(BUCKET).list(`cases/${caseId}/cirbe`)).data ?? []).map((f) => `cases/${caseId}/cirbe/${f.name}`);
    expect(names).toContain(kept);
    expect(names).not.toContain(orphan);
  });
});
