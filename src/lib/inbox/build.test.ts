import { describe, expect, it } from "vitest";
import { buildInbox, type InboxInput } from "./build.ts";

const now = new Date("2026-09-29T12:00:00Z");
const base: InboxInput = { support: [], cases: [], views: [], needsReview: [] };

describe("buildInbox", () => {
  it("open help requests are pending; attended ones stay listed as handled for 30 days", () => {
    const r = buildInbox({
      ...base,
      support: [
        { id: "s1", case_id: "c1", actor: "borrower", message: "No encuentro el CIRBE", status: "open", created_at: "2026-09-28T10:00:00Z", company: "Talleres" },
        { id: "s2", case_id: "c1", actor: "delegate", message: null, status: "closed", created_at: "2026-09-20T10:00:00Z", company: "Talleres" },
        { id: "s3", case_id: "c1", actor: "borrower", message: null, status: "closed", created_at: "2026-07-01T10:00:00Z", company: "Talleres" },
      ],
    }, now);
    expect(r.items.map((i) => [i.id, i.pending])).toEqual([["support:s1", true], ["support:s2", false]]);
    expect(r.items[0]).toMatchObject({ detail: "No encuentro el CIRBE", supportRequestId: "s1" });
    expect(r.pendingCount).toBe(1);
  });

  it("a submission is pending until someone opens the case afterwards", () => {
    const input: InboxInput = { ...base, cases: [{ id: "c1", company: "Talleres", submitted_at: "2026-09-28T10:00:00Z", consent_withdrawn_at: null }] };
    expect(buildInbox(input, now).items[0]).toMatchObject({ kind: "submitted", pending: true });
    expect(buildInbox({ ...input, views: [{ case_id: "c1", at: "2026-09-27T10:00:00Z" }] }, now).items[0].pending).toBe(true); // viewed before
    expect(buildInbox({ ...input, views: [{ case_id: "c1", at: "2026-09-28T11:00:00Z" }] }, now).items[0].pending).toBe(false);
  });

  it("withdrawn consent and documents to review; pending first, newest first; old events drop out", () => {
    const r = buildInbox({
      ...base,
      cases: [
        { id: "c2", company: "Beta", submitted_at: "2026-05-01T00:00:00Z", consent_withdrawn_at: "2026-09-25T00:00:00Z" },
        { id: "c3", company: "Gamma", submitted_at: "2026-09-26T00:00:00Z", consent_withdrawn_at: null },
      ],
      views: [{ case_id: "c3", at: "2026-09-27T00:00:00Z" }],
      needsReview: [{ id: "d1", case_id: "c2", kind: "cirbe", uploaded_at: "2026-09-24T00:00:00Z", company: "Beta" }],
    }, now);
    expect(r.items.map((i) => i.id)).toEqual(["consent:c2", "review:d1", "submitted:c3"]);
    expect(r.pendingCount).toBe(2);
  });

  it("new BORME acts are pending until the case is opened, toned by the most severe act", () => {
    const registry: InboxInput["registry"] = [
      { id: "7", case_id: "c1", at: "2026-09-28T09:00:00Z", company: "Talleres", acts: [{ label: "Nombramientos", severity: null }, { label: "Situación concursal", severity: "high" }, { label: "Nombramientos", severity: null }] },
      { id: "8", case_id: "c2", at: "2026-09-27T09:00:00Z", company: "Beta", acts: [{ label: "Cambio de domicilio social", severity: null }] },
      { id: "9", case_id: "c3", at: "2026-07-01T09:00:00Z", company: "Old", acts: [] },
    ];
    const r = buildInbox({ ...base, registry, views: [{ case_id: "c2", at: "2026-09-27T10:00:00Z" }] }, now);
    expect(r.items.map((i) => [i.id, i.pending, i.tone, i.detail])).toEqual([
      ["registry:7", true, "high", "Nombramientos · Situación concursal"],
      ["registry:8", false, "info", "Cambio de domicilio social"],
    ]);
    expect(r.pendingCount).toBe(1);
  });

  it("an announced deletion is pending until the case is opened after it", () => {
    const purge: InboxInput["purge"] = [{ id: "9", case_id: "c3", at: "2026-09-24T08:30:00Z", company: "Talleres", purge_on: "2026-10-08" }];
    expect(buildInbox({ ...base, purge }, now).items).toEqual([
      { id: "purge:9", kind: "purge", caseId: "c3", company: "Talleres", at: "2026-09-24T08:30:00Z", pending: true, detail: "2026-10-08", tone: "warn" },
    ]);
    expect(buildInbox({ ...base, purge, views: [{ case_id: "c3", at: "2026-09-25T10:00:00Z" }] }, now).items[0].pending).toBe(false);
  });
});
