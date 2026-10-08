/**
 * Data released before a case is deleted: the Holded raw ledgers go when the case is closed (the balances computed from
 * them stay), and chat messages older than 90 days go from both chats (saved conclusions stay).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { releaseOnClose } from "../../src/lib/cases/close-store.ts";
import { deleteOldChats } from "../../src/lib/cases/purge.ts";
import { admin, makeLender, must } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let L: Lender;
const BUCKET = "case-files";

const newCase = async () =>
  (must(await admin.from("cases").insert({ lender_id: L.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa Retención" }).select("id").single()) as { id: string }).id;

beforeAll(async () => {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  L = await makeLender("Fondo Retención");
});

describe("closing releases the Holded raw ledgers", () => {
  it("removes the raw files and their paths, keeps the balances computed from them", async () => {
    const caseId = await newCase();
    const conn = must<{ id: string }>(
      await admin.from("holded_connections").insert({ case_id: caseId, lender_id: L.lenderId, mode: "refresh", borrower_consent_at: new Date().toISOString(), status: "synced", token_ciphertext: "\\x00", token_iv: "\\x00", token_tag: "\\x00" }).select("id").single(),
    );
    const sync = must<{ id: string }>(
      await admin.from("holded_syncs").insert({ connection_id: conn.id, lender_id: L.lenderId, period_kind: "closed_fy", period_start: "2025-01-01", period_end: "2025-12-31" }).select("id").single(),
    );
    const path = `raw/holded/${caseId}/${sync.id}.json`;
    must(await admin.storage.from(BUCKET).upload(path, new TextEncoder().encode('{"lines":[{"account":"4300001","description":"Juan Pérez"}]}'), { upsert: true }));
    must(await admin.from("holded_syncs").update({ raw_storage_path: path }).eq("id", sync.id));
    must(await admin.from("ledger_balances").insert({ case_id: caseId, lender_id: L.lenderId, period_kind: "closed_fy", period_start: "2025-01-01", period_end: "2025-12-31", account: "70000000", pgc3: "700", debit: 0, credit: 1000, source: "holded", source_ref: `holded:ledger:2025-01-01..2025-12-31:acct:70000000#sync:${sync.id}` }));

    expect(await releaseOnClose(admin, caseId)).toEqual({ holded_keys_destroyed: 1, holded_raw_files_removed: 1 });

    expect(((await admin.storage.from(BUCKET).list(`raw/holded/${caseId}`)).data ?? []).length).toBe(0);
    expect(must<{ raw_storage_path: string | null }>(await admin.from("holded_syncs").select("raw_storage_path").eq("id", sync.id).single()).raw_storage_path).toBeNull();
    expect(must<{ token_ciphertext: string | null }>(await admin.from("holded_connections").select("token_ciphertext").eq("id", conn.id).single()).token_ciphertext).toBeNull();
    expect(must(await admin.from("ledger_balances").select("credit").eq("case_id", caseId))).toEqual([{ credit: 1000 }]);

    // Nothing left to release: a second closing is harmless.
    expect(await releaseOnClose(admin, caseId)).toEqual({ holded_keys_destroyed: 0, holded_raw_files_removed: 0 });
  });
});

describe("chat messages older than 90 days", () => {
  it("go from both chats; recent messages and saved conclusions stay", async () => {
    const caseId = await newCase();
    const now = new Date("2026-10-08T09:00:00Z");
    const old = "2026-07-09T08:00:00Z"; // 91 days before
    const recent = "2026-07-11T08:00:00Z"; // 89 days before
    must(await admin.from("assistant_messages").insert([
      { case_id: caseId, lender_id: L.lenderId, role: "user", content: "vieja", created_at: old },
      { case_id: caseId, lender_id: L.lenderId, role: "user", content: "reciente", created_at: recent },
    ]));
    must(await admin.from("analyst_messages").insert([
      { case_id: caseId, lender_id: L.lenderId, user_id: L.userId, role: "user", content: "vieja", created_at: old },
      { case_id: caseId, lender_id: L.lenderId, user_id: L.userId, role: "assistant", content: "reciente", created_at: recent },
    ]));
    must(await admin.from("case_conclusions").insert({ case_id: caseId, lender_id: L.lenderId, text: "Conclusión guardada", citations: [], created_by: L.userId, created_at: old }));

    const r = await deleteOldChats(admin, now);
    expect(r.assistant).toBeGreaterThanOrEqual(1);
    expect(r.analyst).toBeGreaterThanOrEqual(1);
    expect(must(await admin.from("assistant_messages").select("content").eq("case_id", caseId))).toEqual([{ content: "reciente" }]);
    expect(must(await admin.from("analyst_messages").select("content").eq("case_id", caseId))).toEqual([{ content: "reciente" }]);
    expect(must(await admin.from("case_conclusions").select("text").eq("case_id", caseId))).toEqual([{ text: "Conclusión guardada" }]);
  });
});
