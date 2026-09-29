import { describe, expect, it } from "vitest";
import { n43Sample } from "../__fixtures__/n43-sample.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { assignTbPeriods, chooseSource, dedupeBankAccounts } from "./plan.ts";

const FYE = "2025-12-31";
const TODAY = "2026-09-29";
const tb = (docId: string, uploadedAt: string, detected: { start: string; end: string } | null = null) => ({ docId, uploadedAt, fileName: `${docId}.xlsx`, detected });

describe("assignTbPeriods", () => {
  it("uses printed dates: closed year and current year", () => {
    const r = assignTbPeriods([tb("a", "2026-09-01", { start: "2025-01-01", end: "2025-12-31" }), tb("b", "2026-09-02", { start: "2026-01-01", end: "2026-08-31" })], FYE, TODAY);
    expect(r.find((x) => x.docId === "a")).toEqual({ docId: "a", period: { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }, warnings: [] });
    expect(r.find((x) => x.docId === "b")!.period).toEqual({ kind: "ytd", start: "2026-01-01", end: "2026-08-31" });
  });
  it("ignores an older year and keeps the newest file for the same period", () => {
    const r = assignTbPeriods(
      [tb("old", "2026-09-01", { start: "2024-01-01", end: "2024-12-31" }), tb("v1", "2026-09-01", { start: "2025-01-01", end: "2025-12-31" }), tb("v2", "2026-09-05", { start: "2025-01-01", end: "2025-12-31" })],
      FYE, TODAY,
    );
    expect(r.find((x) => x.docId === "old")!.warnings[0].code).toBe("tb_prior_year");
    expect(r.find((x) => x.docId === "v2")!.period?.kind).toBe("closed_fy");
    expect(r.find((x) => x.docId === "v1")).toMatchObject({ period: null, warnings: [{ code: "tb_superseded" }] });
  });
  it("assumes undated files in upload order, with a warning", () => {
    const r = assignTbPeriods([tb("second", "2026-09-02"), tb("first", "2026-09-01")], FYE, TODAY);
    expect(r.find((x) => x.docId === "first")).toMatchObject({ period: { kind: "closed_fy" }, warnings: [{ code: "tb_period_assumed" }] });
    expect(r.find((x) => x.docId === "second")).toMatchObject({ period: { kind: "ytd", start: "2026-01-01", end: TODAY } });
  });
  it("an undated file fills whatever a dated one left open", () => {
    const r = assignTbPeriods([tb("dated", "2026-09-01", { start: "2025-01-01", end: "2025-12-31" }), tb("undated", "2026-09-02")], FYE, TODAY);
    expect(r.find((x) => x.docId === "undated")!.period?.kind).toBe("ytd");
  });
});

describe("chooseSource", () => {
  it("prefers the newest", () => {
    expect(chooseSource("2026-09-02", "2026-09-01")).toBe("upload");
    expect(chooseSource("2026-09-01", "2026-09-02")).toBe("holded");
    expect(chooseSource(null, "2026-09-02")).toBe("holded");
    expect(chooseSource(null, null)).toBeNull();
  });
});

describe("dedupeBankAccounts", () => {
  it("keeps one copy of the same account and period, from the newest file", () => {
    const accounts = parseNorma43(n43Sample, { docId: "x" }).data;
    const kept = dedupeBankAccounts([{ docId: "old", uploadedAt: "2026-09-01", accounts }, { docId: "new", uploadedAt: "2026-09-02", accounts }]);
    expect(kept).toHaveLength(2);
    expect(kept.every((k) => k.docId === "new")).toBe(true);
  });
});
