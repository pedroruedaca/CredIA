/**
 * Retention purge against the real database and storage (0026): a closed case past its lender's period is announced
 * first (audit row, owners' email) and deleted only on the announced date, files first; one audit row without
 * company data stays. A case reopened after the announcement is never deleted.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { runRetentionPurge } from "../../src/lib/cases/purge.ts";
import type { Notifier, PurgeNotice } from "../../src/lib/notify.ts";
import { admin, makeLender, must } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let L: Lender;
const BUCKET = "case-files";

const sent: PurgeNotice[] = [];
const notifier = {
  notifyPurgeScheduled: async (n: PurgeNotice) => {
    sent.push(n);
    return { sent: true };
  },
} as unknown as Notifier;

async function closedCase(closedAt: string, name: string) {
  const id = (must(await admin.from("cases").insert({ lender_id: L.lenderId, borrower_cif: "B12345674", borrower_name: name, status: "archived", closed_at: closedAt, closed_reason: "declined" }).select("id").single()) as { id: string }).id;
  const path = `cases/${id}/cirbe/00000000-0000-4000-8000-000000000001.pdf`;
  must(await admin.storage.from(BUCKET).upload(path, new TextEncoder().encode("%PDF-1.4 test %%EOF"), { upsert: true }));
  must(await admin.from("documents").insert({ case_id: id, lender_id: L.lenderId, kind: "cirbe", storage_path: path, sha256: crypto.randomUUID(), original_filename: "cirbe.pdf", uploaded_by: "lender" }));
  return { id, path };
}

const exists = async (id: string) => (must(await admin.from("cases").select("id").eq("id", id)) as unknown[]).length === 1;
const fileExists = async (path: string) => {
  const [dir, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  return ((await admin.storage.from(BUCKET).list(dir)).data ?? []).some((f) => f.name === name);
};

beforeAll(async () => {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  L = await makeLender("Fondo Purga");
  must(await admin.from("lenders").update({ retention_months: 12, auto_close_months: null }).eq("id", L.lenderId));
});

describe("retention purge", () => {
  it("announces 14 days ahead, then deletes the case and its files on the date, leaving one anonymous audit row", async () => {
    const c = await closedCase("2025-10-08T10:00:00Z", "Empresa Caducada"); // due 2026-10-08

    // 15 days before: nothing yet.
    await runRetentionPurge(admin, notifier, { now: new Date("2026-09-23T09:00:00Z") });
    expect(sent.filter((n) => n.lenderId === L.lenderId)).toHaveLength(0);

    // 14 days before: announced (row, audit, email to the lender), not deleted.
    await runRetentionPurge(admin, notifier, { now: new Date("2026-09-24T09:00:00Z") });
    const row = must<{ purge_warned_for: string }>(await admin.from("cases").select("purge_warned_for").eq("id", c.id).single());
    expect(row.purge_warned_for).toBe("2026-10-08");
    expect(must(await admin.from("audit_log").select("action, detail").eq("case_id", c.id).eq("action", "case.purge_scheduled"))).toEqual([{ action: "case.purge_scheduled", detail: { purge_on: "2026-10-08" } }]);
    const notice = sent.find((n) => n.lenderId === L.lenderId)!;
    expect(notice.cases).toEqual([{ caseId: c.id, companyName: "Empresa Caducada", purgeOn: "8 oct 2026" }]);

    // A second run the same day does not warn again.
    await runRetentionPurge(admin, notifier, { now: new Date("2026-09-24T10:00:00Z") });
    expect(sent.filter((n) => n.lenderId === L.lenderId)).toHaveLength(1);

    // The day before: still there.
    await runRetentionPurge(admin, notifier, { now: new Date("2026-10-07T09:00:00Z") });
    expect(await exists(c.id)).toBe(true);
    expect(await fileExists(c.path)).toBe(true);

    // On the date: case, rows and file gone.
    const run = await runRetentionPurge(admin, notifier, { now: new Date("2026-10-08T09:00:00Z") });
    expect(run.purged).toContain(c.id);
    expect(await exists(c.id)).toBe(false);
    expect(must(await admin.from("documents").select("id").eq("case_id", c.id))).toEqual([]);
    expect(await fileExists(c.path)).toBe(false);

    const trail = must<{ actor: string; case_id: string | null; detail: Record<string, unknown> }[]>(
      await admin.from("audit_log").select("actor, case_id, detail").eq("lender_id", L.lenderId).eq("action", "case.purged"),
    ).filter((r) => r.detail.case_id === c.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ actor: "system", case_id: null, detail: { purge_on: "2026-10-08", retention_months: 12, files_removed: 1 } });
    expect(JSON.stringify(trail[0].detail)).not.toMatch(/Empresa|B12345674/);
  });

  it("a case reopened after the announcement is never deleted", async () => {
    const c = await closedCase("2025-10-08T10:00:00Z", "Empresa Reabierta");
    await runRetentionPurge(admin, notifier, { now: new Date("2026-09-24T09:00:00Z") });
    must(await admin.from("cases").update({ status: "awaiting_documents", closed_at: null, closed_reason: null }).eq("id", c.id));
    await runRetentionPurge(admin, notifier, { now: new Date("2026-10-08T09:00:00Z") });
    expect(await exists(c.id)).toBe(true);
    expect(await fileExists(c.path)).toBe(true);
  });

  it("closing it again later needs a new announcement before any deletion", async () => {
    const c = await closedCase("2025-10-08T10:00:00Z", "Empresa Recerrada");
    await runRetentionPurge(admin, notifier, { now: new Date("2026-09-24T09:00:00Z") });
    must(await admin.from("cases").update({ status: "awaiting_documents", closed_at: null, closed_reason: null }).eq("id", c.id));
    must(await admin.from("cases").update({ status: "archived", closed_at: "2026-09-30T10:00:00Z", closed_reason: "withdrawn" }).eq("id", c.id));
    await runRetentionPurge(admin, notifier, { now: new Date("2026-10-08T09:00:00Z") });
    expect(await exists(c.id)).toBe(true);
  });
});
