import { describe, expect, it } from "vitest";
import { annualAccountsWireSample } from "../__fixtures__/annual-accounts.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { assessExtraction } from "../extract/assess.ts";
import { statementFromAnnualAccounts } from "../pgc/annual-accounts.ts";
import { buildStatement } from "../pgc/mapping.ts";
import {
  adjustedGrossMarginKpi,
  applyCostOfSales,
  costOptions,
  normalizeCostDefinition,
  presetOf,
  PRESET_SELECTORS,
  type CostOfSalesDefinition,
} from "./cost-of-sales.ts";

// tb-small-sl, closed year: revenue 1.000.000; 600 compras 550.000; 621 arrendamientos 36.000; 629 otros servicios
// 64.000; 640 sueldos 180.000; 642 Seguridad Social 55.000; 631 tributos 5.000.
const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
const def = (selectors: string[], preset: CostOfSalesDefinition["preset"] = "custom"): CostOfSalesDefinition => ({ preset, selectors });

describe("cost of sales defined by the analyst", () => {
  it("trading = the accounting gross margin", () => {
    const k = adjustedGrossMarginKpi(closed, def(PRESET_SELECTORS.trading, "trading"));
    expect(k.value).toBe(45);
    expect(k.inputs).toEqual({ revenue: 1_000_000, adjustedCostOfSales: 550_000, accountingCostOfSales: 550_000 });
    expect(k.note).toMatch(/^Criterio del analista \(Comercio\): Aprovisionamientos/);
  });

  it("services: purchases + personnel (+ 623, absent here and said so)", () => {
    const k = adjustedGrossMarginKpi(closed, def(PRESET_SELECTORS.services, "services"));
    expect(k.value).toBe(21.5); // (1.000.000 − 550.000 − 235.000) / 1.000.000
    expect(k.note).toMatch(/Sin importe en este periodo: 623 Servicios de profesionales independientes/);
  });

  it("manufacturing adds plant rent (621) but not the other services (629)", () => {
    expect(adjustedGrossMarginKpi(closed, def(PRESET_SELECTORS.manufacturing, "manufacturing")).value).toBe(17.9); // 821.000
  });

  it("subaccounts and groups, each contribution counted once", () => {
    expect(applyCostOfSales(closed, def(["line:cogs", "640", "62100000"])).total).toBe(766_000);
    const r = applyCostOfSales(closed, def(["line:personnel", "640", "64000000"]));
    expect(r.total).toBe(235_000); // 640 is inside personnel: not twice
    expect(r.items.every((i) => i.sourceRef.length > 0)).toBe(true);
    expect(r.unmatched).toEqual([]);
  });

  it("names the reason when there is nothing to compute", () => {
    expect(adjustedGrossMarginKpi(closed, null).note).toMatch(/^Sin definir/);
    const bsOnly = buildStatement(tbSmallSl.filter((b) => !/^[67]/.test(b.pgc3)), { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
    expect(adjustedGrossMarginKpi(bsOnly, def(["line:cogs"])).value).toBeNull();
  });

  it("works on statements from the annual accounts, by line or model line; account codes say why they don't apply", () => {
    const a = assessExtraction("cuentas_anuales", annualAccountsWireSample, { fileName: "c.pdf", caseCif: "B12345674", companyName: "X SL", lenderName: "F", expectedFiscalYear: 2025 });
    if (a.canonical?.kind !== "annual_accounts") throw new Error("expected annual accounts");
    const s = statementFromAnnualAccounts(a.canonical.data, "doc-1", { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
    const byLine = adjustedGrossMarginKpi(s, def(["line:cogs", "line:personnel"]));
    const byLabel = adjustedGrossMarginKpi(s, def(["line:cogs", "label:Gastos de personal"]));
    expect(byLine.value).not.toBeNull();
    expect(byLabel.value).toBe(byLine.value);
    const withCode = adjustedGrossMarginKpi(s, def(["line:cogs", "line:personnel", "623"]));
    expect(withCode.value).toBe(byLine.value);
    expect(withCode.note).toMatch(/con cuentas anuales solo cuentan las líneas del modelo/);
  });
});

describe("definitions", () => {
  it("normalises: invalid selectors out, preset kept only while it matches", () => {
    expect(normalizeCostDefinition({ preset: "services", selectors: ["line:cogs", "line:personnel", "623", "7000", "line:depreciation", "line:cogs"] })).toEqual({
      preset: "services",
      selectors: ["line:cogs", "line:personnel", "623"],
    });
    expect(normalizeCostDefinition({ preset: "services", selectors: ["line:cogs"] })).toEqual({ preset: "custom", selectors: ["line:cogs"] });
    expect(normalizeCostDefinition({ preset: "trading", selectors: [] })).toBeNull();
    expect(normalizeCostDefinition("x")).toBeNull();
    expect(presetOf(["line:personnel", "line:cogs", "623"])).toBe("services");
  });

  it("offers lines, PGC groups and subaccounts with amounts per period", () => {
    const opts = costOptions([closed], { "62100000": "Arrendamientos" });
    const services = opts.find((o) => o.line === "externalServices")!.option;
    expect(services.amounts.closed_fy).toBe(100_000);
    expect(services.children.map((c) => c.selector)).toEqual(["621", "629"]);
    expect(services.children[0].label).toBe("621 Arrendamientos y cánones");
    expect(services.children[0].children[0]).toMatchObject({ selector: "62100000", label: "62100000 Arrendamientos", amounts: { closed_fy: 36_000 } });
  });
});

describe("ticking in the editor", () => {
  it("a line absorbs its groups and subaccounts; unticking keeps the rest", async () => {
    const { toggleSelection, descendants } = await import("./cost-of-sales.ts");
    const opts = costOptions([closed]);
    const order = opts.flatMap((o) => [o.option.selector, ...descendants(o.option)]);
    const services = opts.find((o) => o.line === "externalServices")!.option;
    let sel = toggleSelection(["line:cogs", "62100000"], services.children[0], true, order); // 621
    expect(sel).toEqual(["line:cogs", "621"]);
    sel = toggleSelection(sel, services, true, order);
    expect(sel).toEqual(["line:cogs", "line:externalServices"]);
    sel = toggleSelection(sel, services, false, order);
    expect(sel).toEqual(["line:cogs"]);
  });
});

describe("template default", () => {
  it("offers lines with their 3-digit PGC groups", async () => {
    const { templateCostOptions } = await import("./cost-of-sales.ts");
    const opts = templateCostOptions();
    expect(opts.find((o) => o.line === "personnel")!.option.children.map((c) => c.selector)).toEqual(["640", "641", "642", "643", "649"]);
    expect(opts.find((o) => o.line === "otherTaxes")!.option.children.map((c) => c.selector)).toEqual(["631", "634", "639"]); // never 630 (income tax)
  });

  it("parses and writes back the form fields", async () => {
    const { costFormValues, parseCostFields } = await import("./cost-of-sales.ts");
    expect(parseCostFields({ cos_preset: "none", "cos:line:cogs": "on" })).toBeNull();
    expect(parseCostFields({ cos_preset: "services" })).toEqual({ preset: "services", selectors: PRESET_SELECTORS.services });
    const custom = parseCostFields({ cos_preset: "custom", "cos:line:cogs": "on", "cos:640": "on", "cos:bad": "on" });
    expect(custom).toEqual({ preset: "custom", selectors: ["line:cogs", "640"] });
    expect(parseCostFields(costFormValues(custom))).toEqual(custom);
    expect(costFormValues(null)).toEqual({ cos_preset: "none" });
  });
});
