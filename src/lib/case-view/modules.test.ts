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

describe("editing a layout", () => {
  const l = DEFAULT_LAYOUT;
  it("moves, removes, adds and resizes", async () => {
    const { addModule, availableModules, moveModule, removeModule, sameLayout, setModuleWidth } = await import("./modules.ts");
    const moved = moveModule(l, 9, 0);
    expect(moved.modules[0].id).toBe("sources");
    expect(moved.modules).toHaveLength(10);
    expect(moveModule(l, 0, 99)).toBe(l);

    const removed = removeModule(l, "kpis");
    expect(removed.modules.map((m) => m.id)).not.toContain("kpis");
    expect(removeModule(l, "review")).toBe(l); // cannot be removed
    expect(availableModules(removed).map((s) => s.id)).toEqual(["kpis"]);

    const back = addModule(removed, "kpis");
    expect(back.modules.at(-1)).toEqual({ id: "kpis", width: "full" });
    expect(addModule(back, "kpis")).toBe(back);

    expect(setModuleWidth(l, "balance", "half").modules.find((m) => m.id === "balance")!.width).toBe("half");
    expect(setModuleWidth(l, "pnl", "half")).toBe(l); // the Sankey only takes the full width
    expect(sameLayout(l, normalizeLayout(JSON.parse(JSON.stringify(l))))).toBe(true);
  });
});

describe("which layout a case draws", () => {
  it("the case's own, else the template's, else the team's, else the original", async () => {
    const { resolveCaseLayout } = await import("./modules.ts");
    const mk = (id: string) => ({ version: 1, modules: [{ id, width: "full" }] });
    expect(resolveCaseLayout({ caseLayout: mk("kpis"), templateLayout: mk("pnl"), teamLayout: mk("balance") }).source).toBe("case");
    expect(resolveCaseLayout({ templateLayout: mk("pnl"), teamLayout: mk("balance") })).toMatchObject({ source: "template", layout: { modules: [{ id: "pnl" }, { id: "review" }] } });
    expect(resolveCaseLayout({ teamLayout: mk("balance") }).source).toBe("team");
    expect(resolveCaseLayout({})).toEqual({ layout: DEFAULT_LAYOUT, source: "default" });
  });
});

describe("module settings", () => {
  it("keeps only the settings a module takes, with valid values", async () => {
    const { normalizeSettings } = await import("./modules.ts");
    expect(normalizeSettings("kpis", { tiles: ["dsoDpo", "scoring", "dsoDpo", "revenue", "dscr", "ebitda", "workingCapital", "financialDebt"], period: "ytd" })).toEqual({
      tiles: ["dsoDpo", "revenue", "dscr", "ebitda", "workingCapital"], // unknown and repeated out, at most 5
    });
    expect(normalizeSettings("pnl", { period: "ytd", showPassed: false })).toEqual({ period: "ytd" });
    expect(normalizeSettings("pnl", { period: "next_year" })).toBeUndefined();
    expect(normalizeSettings("review", { showPassed: false })).toEqual({ showPassed: false });
    expect(normalizeSettings("sources", { showPassed: false })).toBeUndefined();
    expect(normalizeSettings("kpis", { tiles: [] })).toBeUndefined();
  });

  it("survive normalizeLayout and fill in defaults", async () => {
    const { moduleSettings, setModuleSettings } = await import("./modules.ts");
    const l = normalizeLayout({ version: 1, modules: [{ id: "kpis", width: "full", settings: { tiles: ["dsoDpo"] } }, { id: "balance", width: "half", settings: { period: "closed" } }] });
    expect(l.modules[0]).toEqual({ id: "kpis", width: "full", settings: { tiles: ["dsoDpo"] } });
    expect(moduleSettings(l.modules[1])).toEqual({ tiles: ["dscr", "interestCoverage", "netDebtToEbitda", "currentRatio", "dsoDpo"], period: "closed", showPassed: true });
    const changed = setModuleSettings(l, "balance", { period: "ytd" });
    expect(changed.modules.find((m) => m.id === "balance")!.settings).toEqual({ period: "ytd" });
    expect(setModuleSettings(l, "balance", { period: "bad" as never }).modules.find((m) => m.id === "balance")!.settings).toEqual({ period: "closed" });
  });
});
