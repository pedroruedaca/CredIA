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
    expect(addModule(back, "balance")).toBe(back); // already there, and appears once
    expect(addModule(back, "kpis").modules.at(-1)).toEqual({ id: "kpis", key: "kpis-2", width: "full" }); // repeatable

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
    // Bank tiles are ids like any other.
    expect(normalizeSettings("kpis", { tiles: ["daysCashOnHand", "dscr", "overdraftDays"] })).toEqual({ tiles: ["daysCashOnHand", "dscr", "overdraftDays"] });
    expect(normalizeSettings("summary", { facts: ["netDebt", "scoring", "netDebt", "revenue"], tiles: ["dscr"] })).toEqual({ facts: ["netDebt", "revenue"] });
    expect(normalizeSettings("summary", { facts: [] })).toBeUndefined();
  });

  it("survive normalizeLayout and fill in defaults", async () => {
    const { moduleSettings, setModuleSettings } = await import("./modules.ts");
    const l = normalizeLayout({ version: 1, modules: [{ id: "kpis", width: "full", settings: { tiles: ["dsoDpo"] } }, { id: "balance", width: "half", settings: { period: "closed" } }] });
    expect(l.modules[0]).toEqual({ id: "kpis", width: "full", settings: { tiles: ["dsoDpo"] } });
    expect(moduleSettings(l.modules[1])).toEqual({
      facts: ["revenue", "ebitda", "cirbe"],
      tiles: ["dscr", "interestCoverage", "netDebtToEbitda"], // half width: three tiles (only «Indicadores» uses them)
      period: "closed",
      showPassed: true,
    });
    const changed = setModuleSettings(l, "balance", { period: "ytd" });
    expect(changed.modules.find((m) => m.id === "balance")!.settings).toEqual({ period: "ytd" });
    expect(setModuleSettings(l, "balance", { period: "bad" as never }).modules.find((m) => m.id === "balance")!.settings).toEqual({ period: "closed" });
  });
});

describe("repeatable «Indicadores»", () => {
  it("adds numbered copies, each with its own key, width and settings, up to the limit", async () => {
    const { addModule, availableModules, MAX_INSTANCES, moduleKey, moduleTitle, removeModule, setModuleSettings, setModuleWidth } = await import("./modules.ts");
    let l = addModule(DEFAULT_LAYOUT, "kpis");
    expect(l.modules.at(-1)).toEqual({ id: "kpis", key: "kpis-2", width: "full" });
    expect(moduleTitle(l.modules.at(-1)!)).toBe("Indicadores 2");
    expect(moduleTitle(l.modules[1])).toBe("Indicadores");
    l = setModuleWidth(l, "kpis-2", "half");
    l = setModuleSettings(l, "kpis-2", { tiles: ["daysCashOnHand"] });
    expect(l.modules[1]).toEqual({ id: "kpis", width: "full" }); // the first copy untouched
    expect(l.modules.at(-1)).toEqual({ id: "kpis", key: "kpis-2", width: "half", settings: { tiles: ["daysCashOnHand"] } });
    for (let i = 0; i < 5; i++) l = addModule(l, "kpis");
    expect(l.modules.filter((m) => m.id === "kpis")).toHaveLength(MAX_INSTANCES);
    expect(availableModules(l).some((s) => s.id === "kpis")).toBe(false);
    // Adding a module that is not repeatable twice is still a no-op.
    expect(addModule(l, "balance")).toBe(l);
    l = removeModule(l, "kpis-2");
    expect(l.modules.map(moduleKey).filter((k) => k.startsWith("kpis"))).toEqual(["kpis", "kpis-3", "kpis-4"]);
    expect(addModule(l, "kpis").modules.at(-1)!.key).toBe("kpis-2"); // the free key again
    expect(normalizeLayout(l)).toEqual(l);
  });

  it("normalises copies: keys repaired, at most four, other modules still once", () => {
    const l = normalizeLayout({
      version: 1,
      modules: [
        { id: "kpis", width: "half" },
        { id: "kpis", width: "half" }, // no key: gets the next free one
        { id: "kpis", key: "kpis-2", width: "full" }, // key taken
        { id: "kpis", key: "balance", width: "full" }, // not a key of this module
        { id: "kpis", width: "full" }, // fifth: dropped
        { id: "review", key: "review-2", width: "full" }, // not repeatable: the key is dropped
      ],
    });
    expect(l.modules).toEqual([
      { id: "kpis", width: "half" },
      { id: "kpis", key: "kpis-2", width: "half" },
      { id: "kpis", key: "kpis-3", width: "full" },
      { id: "kpis", key: "kpis-4", width: "full" },
      { id: "review", width: "full" },
    ]);
  });

  it("a half-width module shows three tiles, a full one five", async () => {
    const { moduleSettings } = await import("./modules.ts");
    expect(moduleSettings({ width: "half" }).tiles).toEqual(["dscr", "interestCoverage", "netDebtToEbitda"]);
    expect(moduleSettings({ width: "full" }).tiles).toHaveLength(5);
    const tiles = ["revenue", "ebitda", "dscr", "minBalance"] as const;
    expect(moduleSettings({ width: "half", settings: { tiles: [...tiles] } }).tiles).toEqual(["revenue", "ebitda", "dscr"]);
    expect(moduleSettings({ width: "full", settings: { tiles: [...tiles] } }).tiles).toEqual([...tiles]);
  });
});
