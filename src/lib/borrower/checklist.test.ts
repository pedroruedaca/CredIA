import { describe, expect, it } from "vitest";
import { buildChecklist, freshnessProblem, freshnessWindow, type ChecklistDocument } from "./checklist.ts";

const NOW = new Date("2026-09-29T10:00:00Z");
const LENDER = "Fondo Ejemplo Capital";

const reqs = [
  { doc_kind: "tgss_cert", required: true, max_age_days: 90 },
  { doc_kind: "cuentas_anuales", required: false, max_age_days: null },
  { doc_kind: "trial_balance", required: true, max_age_days: null },
  { doc_kind: "norma43", required: true, max_age_days: null },
  { doc_kind: "cirbe", required: true, max_age_days: null },
];

let n = 0;
const doc = (kind: string, over: Partial<ChecklistDocument> = {}): ChecklistDocument => ({
  id: `d${++n}`,
  kind,
  status: "uploaded",
  original_name: `${kind}.pdf`,
  issued_on: null,
  status_message: null,
  uploaded_at: `2026-09-2${n % 9}T10:00:00Z`,
  ...over,
});

describe("freshness", () => {
  it("phrases the window in months when it divides evenly", () => {
    expect(freshnessWindow(90)).toBe("de los últimos 3 meses");
    expect(freshnessWindow(30)).toBe("del último mes");
    expect(freshnessWindow(45)).toBe("de los últimos 45 días");
  });
  it("accepts a certificate issued within the window, inclusive", () => {
    expect(freshnessProblem("2026-07-01", 90, LENDER, NOW)).toBeNull(); // 90 days
    expect(freshnessProblem("2026-09-29", 90, LENDER, NOW)).toBeNull();
  });
  it("explains a stale certificate with its month and the lender's rule", () => {
    expect(freshnessProblem("2026-03-12", 90, LENDER, NOW)).toBe(
      "El certificado subido es de marzo de 2026. Fondo Ejemplo Capital necesita uno de los últimos 3 meses.",
    );
  });
  it("rejects future and unreadable dates", () => {
    expect(freshnessProblem("2026-10-15", 90, LENDER, NOW)).toMatch(/posterior a hoy/);
    expect(freshnessProblem("no-date", 90, LENDER, NOW)).toMatch(/fecha de emisión/);
  });
});

describe("buildChecklist", () => {
  it("orders required items canonically, optional last, and counts only required", () => {
    const c = buildChecklist(reqs, [], [], LENDER, NOW);
    expect(c.items.map((i) => i.kind)).toEqual(["trial_balance", "norma43", "cirbe", "tgss_cert", "cuentas_anuales"]);
    expect(c.items.map((i) => i.step)).toEqual([1, 2, 3, 4, 5]);
    expect(c).toMatchObject({ done: 0, total: 4, expanded: "trial_balance", canSubmit: false });
    expect(c.items.every((i) => i.state === "pending")).toBe(true);
  });

  it("a synced Holded connection completes the accounting item; expands the next incomplete one", () => {
    const c = buildChecklist(reqs, [], [{ status: "synced", mode: "one_time", last_sync_at: "2026-09-28T10:00:00Z", revoked_at: null }], LENDER, NOW);
    expect(c.items[0].state).toBe("done");
    expect(c.expanded).toBe("norma43");
  });

  it("a revoked refresh key keeps the imported data counting", () => {
    const c = buildChecklist(reqs, [], [{ status: "synced", mode: "refresh", last_sync_at: "2026-09-28T10:00:00Z", revoked_at: "2026-09-29T08:00:00Z" }], LENDER, NOW);
    expect(c.items[0].state).toBe("done");
  });

  it("a Holded sync in progress is in_progress; a failed one needs attention", () => {
    const syncing = buildChecklist(reqs, [], [{ status: "syncing", mode: "one_time", last_sync_at: null, revoked_at: null }], LENDER, NOW);
    expect(syncing.items[0].state).toBe("in_progress");
    const failed = buildChecklist(reqs, [], [{ status: "invalid_key", mode: "one_time", last_sync_at: null, revoked_at: null }], LENDER, NOW);
    expect(failed.items[0]).toMatchObject({ state: "attention" });
    expect(failed.items[0].message).toMatch(/Holded/);
  });

  it("a rejected certificate needs attention with its fix message; a newer valid one completes it", () => {
    const stale = doc("tgss_cert", { status: "rejected", issued_on: "2026-03-12", status_message: "El certificado subido es de marzo de 2026.", uploaded_at: "2026-09-20T10:00:00Z" });
    let c = buildChecklist(reqs, [stale], [], LENDER, NOW);
    const tgss = c.items.find((i) => i.kind === "tgss_cert")!;
    expect(tgss).toMatchObject({ state: "attention", message: "El certificado subido es de marzo de 2026." });

    const fresh = doc("tgss_cert", { issued_on: "2026-09-22", uploaded_at: "2026-09-28T10:00:00Z" });
    c = buildChecklist(reqs, [stale, fresh], [], LENDER, NOW);
    expect(c.items.find((i) => i.kind === "tgss_cert")!.state).toBe("done");
  });

  it("a certificate accepted at upload but expired since needs attention", () => {
    const old = doc("tgss_cert", { issued_on: "2026-06-01" }); // 120 days before NOW
    const c = buildChecklist(reqs, [old], [], LENDER, NOW);
    expect(c.items.find((i) => i.kind === "tgss_cert")!.message).toBe(
      "El certificado subido es de junio de 2026. Fondo Ejemplo Capital necesita uno de los últimos 3 meses.",
    );
  });

  it("failed and needs_review documents need attention with a default message", () => {
    const c = buildChecklist(reqs, [doc("cirbe", { status: "failed" }), doc("norma43", { status: "needs_review" })], [], LENDER, NOW);
    expect(c.items.find((i) => i.kind === "cirbe")!.message).toMatch(/No hemos podido leer/);
    expect(c.items.find((i) => i.kind === "norma43")!.message).toMatch(/revisando/);
  });

  it("allows submission once every required item is done, even with optional ones pending", () => {
    const docs = [doc("trial_balance"), doc("norma43"), doc("norma43"), doc("cirbe", { status: "parsed" }), doc("tgss_cert", { issued_on: "2026-09-01" })];
    const c = buildChecklist(reqs, docs, [], LENDER, NOW);
    expect(c).toMatchObject({ done: 4, total: 4, canSubmit: true, expanded: "cuentas_anuales" });
    expect(c.items.find((i) => i.kind === "norma43")!.accepted).toHaveLength(2);
  });

  it("ignores documents of kinds that were not requested", () => {
    const c = buildChecklist([{ doc_kind: "cirbe", required: true, max_age_days: null }], [doc("modelo200")], [], LENDER, NOW);
    expect(c.items.map((i) => i.kind)).toEqual(["cirbe"]);
    expect(c.canSubmit).toBe(false);
  });
});
