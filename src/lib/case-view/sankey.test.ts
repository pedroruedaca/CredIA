import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { layoutSankey, pnlSankey, type PnlSankey } from "./sankey.ts";

const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;

/** Every node with both inputs and outputs passes on exactly what it receives. */
function conserves(m: PnlSankey) {
  for (const n of m.nodes) {
    const inn = m.links.filter((l) => l.target === n.id).reduce((s, l) => s + l.value, 0);
    const out = m.links.filter((l) => l.source === n.id).reduce((s, l) => s + l.value, 0);
    if (inn > 0 && out > 0) expect(out).toBeCloseTo(inn, 1);
    if (inn > 0) expect(inn).toBeCloseTo(n.value, 1);
    if (out > 0) expect(out).toBeCloseTo(n.value, 1);
  }
}
const val = (m: PnlSankey, id: string) => m.nodes.find((n) => n.id === id)?.value;

describe("pnlSankey", () => {
  it("adds an Ingresos column only when there is other operating income", () => {
    const withOther = structuredClone(closed);
    withOther.incomeStatement.otherOperatingIncome = 20_000;
    withOther.incomeStatement.ebitda += 20_000;
    withOther.incomeStatement.operatingResult += 20_000;
    withOther.incomeStatement.netIncome += 20_000;
    const m = pnlSankey(withOther)!;
    expect(m.nodes.find((n) => n.id === "income")).toMatchObject({ label: "Ingresos", col: 1, value: 1_020_000 });
    conserves(m);
    expect(pnlSankey(closed)!.nodes.find((n) => n.id === "income")).toMatchObject({ label: "Cifra de negocios", col: 0 });
  });

  it("cascades income → gross margin → EBITDA → operating result → net profit, conserving flow", () => {
    const m = pnlSankey(closed)!;
    expect(m.kind).toBe("cascade");
    expect(val(m, "income")).toBe(1_000_000);
    expect(val(m, "gross")).toBe(1_000_000 - closed.incomeStatement.cogs);
    expect(val(m, "ebitda")).toBe(110_000);
    expect(val(m, "operating")).toBe(closed.incomeStatement.operatingResult);
    expect(val(m, "net")).toBe(closed.incomeStatement.netIncome);
    conserves(m);
    const personnel = m.nodes.find((n) => n.id === "personnel")!;
    expect(personnel.accounts.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(personnel.value, 2);
  });

  it("falls back to a flat layout with the loss as a source when the company loses money", () => {
    const loss = structuredClone(closed);
    loss.incomeStatement.personnel += 300_000;
    loss.incomeStatement.ebitda -= 300_000;
    loss.incomeStatement.operatingResult -= 300_000;
    loss.incomeStatement.preTaxResult -= 300_000;
    loss.incomeStatement.netIncome -= 300_000;
    const m = pnlSankey(loss)!;
    expect(m.kind).toBe("flat");
    expect(val(m, "loss")).toBeCloseTo(-loss.incomeStatement.netIncome, 2);
    expect(m.nodes.some((n) => n.id === "net")).toBe(false);
    conserves(m);
  });

  it("is null without a P&L", () => {
    expect(pnlSankey({ ...closed, pnlAvailable: false })).toBeNull();
  });
});

describe("layoutSankey", () => {
  it("keeps a minimum slot per node so labels do not collide", () => {
    const l = layoutSankey(pnlSankey(closed)!, { width: 760, height: 300, gap: 8, minSlot: 28 });
    for (const col of new Set(l.nodes.map((n) => n.x))) {
      const ys = l.nodes.filter((n) => n.x === col).map((n) => n.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(36 - 0.01);
    }
  });

  it("places columns left to right, fits the height and gives links their target's colour", () => {
    const m = pnlSankey(closed)!;
    const l = layoutSankey(m, { width: 760, height: 300 });
    const xs = [...new Set(l.nodes.map((n) => n.x))];
    expect(xs).toHaveLength(5); // no other income → the chart starts at sales
    expect(Math.max(...xs)).toBeLessThanOrEqual(760 - 150);
    expect(l.height).toBeLessThanOrEqual(300.5);
    expect(l.links.every((k) => k.path.startsWith("M") && k.path.endsWith("Z"))).toBe(true);
    expect(l.links.find((k) => k.target === "cogs")!.tone).toBe("other");
  });
});
