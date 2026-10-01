import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, layoutRows, MODULE_IDS, MODULE_SPECS, normalizeLayout } from "./modules.ts";

describe("case view modules", () => {
  it("the default layout draws every module once, full width, review included", () => {
    expect(DEFAULT_LAYOUT.modules.map((m) => m.id)).toEqual([...MODULE_IDS]);
    expect(DEFAULT_LAYOUT.modules.every((m) => m.width === "full")).toBe(true);
    expect(normalizeLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
  });

  it("only «Para revisar» cannot be removed", () => {
    expect(Object.values(MODULE_SPECS).filter((s) => !s.removable).map((s) => s.id)).toEqual(["review"]);
  });

  it("normalises a stored layout: unknown and repeated modules out, widths the module allows, review back in", () => {
    const l = normalizeLayout({
      version: 1,
      modules: [
        { id: "balance", width: "half" },
        { id: "pnl", width: "half" }, // the Sankey needs the full width
        { id: "scoring", width: "full" }, // not a module
        { id: "balance", width: "full" }, // repeated
        { id: "kpis" }, // no width
      ],
    });
    expect(l.modules).toEqual([
      { id: "balance", width: "half" },
      { id: "pnl", width: "full" },
      { id: "review", width: "full" },
      { id: "kpis", width: "full" },
    ]);
  });

  it("falls back to the default for anything that is not a layout", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ version: 2, modules: [] })).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ version: 1, modules: "x" })).toEqual(DEFAULT_LAYOUT);
  });

  it("an empty layout still shows «Para revisar»", () => {
    expect(normalizeLayout({ version: 1, modules: [] }).modules).toEqual([{ id: "review", width: "full" }]);
  });

  it("pairs consecutive half modules into rows", () => {
    const rows = layoutRows([
      { id: "a", width: "full" as const },
      { id: "b", width: "half" as const },
      { id: "c", width: "half" as const },
      { id: "d", width: "half" as const },
      { id: "e", width: "full" as const },
    ]);
    expect(rows.map((r) => r.map((m) => m.id))).toEqual([["a"], ["b", "c"], ["d"], ["e"]]);
  });
});
