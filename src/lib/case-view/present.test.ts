import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { cirbeNetDebtToEbitda, describeSource, formatAccount, splitChecks, summariseSources } from "./present.ts";

const docs = [
  { id: "c1", kind: "cirbe", original_filename: "cirbe.pdf", issued_on: "2026-08-31" },
  { id: "t1", kind: "trial_balance", original_filename: "sys.xlsx" },
  { id: "n1", kind: "norma43", original_filename: "a.n43" },
];

describe("describeSource", () => {
  it("labels document pages, rows and lines, and Holded accounts", () => {
    expect(describeSource("doc:c1:page:2", docs)).toEqual({ label: "CIRBE 31 ago 2026 · pág. 2", docId: "c1", page: 2 });
    expect(describeSource("doc:t1:sheet:Sumas:row:14", docs)).toMatchObject({ label: "Sumas y saldos · fila 14", docId: "t1" });
    expect(describeSource("doc:n1:line:7", docs).label).toBe("Norma 43 · línea 7");
    expect(describeSource("holded:ledger:2025-01-01..2025-12-31:acct:5200001#sync:9", docs)).toEqual({ label: "Holded · cuenta 520·0001", docId: null, page: null });
    expect(describeSource("doc:gone:page:1", docs)).toMatchObject({ label: "Documento · pág. 1", docId: null });
    expect(describeSource("borme:2026-09-29:BORME-A-2026-185-46:entry:412348", docs)).toEqual({
      label: "BORME 29 sept 2026 · anuncio 412348",
      docId: null,
      page: null,
      url: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf",
    });
  });
  it("de-duplicates and caps sources", () => {
    const refs = ["doc:t1:row:1", "doc:t1:row:1", ...Array.from({ length: 8 }, (_, i) => `doc:t1:row:${i + 2}`)];
    const r = summariseSources(refs, docs, 3);
    expect(r.shown).toHaveLength(3);
    expect(r.more).toBe(6);
  });
  it("formats accounts as group·subaccount", () => {
    expect(formatAccount("57200002")).toBe("572·00002");
    expect(formatAccount("430")).toBe("430");
    expect(formatAccount("Existencias")).toBe("Existencias"); // annual-accounts model line
  });
});

describe("splitChecks", () => {
  it("orders open checks high → warn → info and separates passes", () => {
    const c = (id: number, status: "pass" | "fail", severity: "high" | "warn" | "info") => ({ id, status, severity });
    const { open, passed } = splitChecks([c(1, "fail", "info"), c(2, "fail", "high"), c(3, "pass", "info"), c(4, "fail", "warn"), c(5, "fail", "high")]);
    expect(open.map((x) => x.id)).toEqual([2, 5, 4, 1]);
    expect(passed.map((x) => x.id)).toEqual([3]);
  });
});

describe("cirbeNetDebtToEbitda", () => {
  it("uses CIRBE debt net of cash over annualised EBITDA", () => {
    const s = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
    const k = cirbeNetDebtToEbitda(s, 245_000);
    // cash 174.000 → (245.000 − 174.000) / 110.000
    expect(k.value).toBeCloseTo(0.65, 2);
    expect(k.inputs.cirbeDrawn).toBe(245_000);
  });
});

describe("kpiTiles", () => {
  it("builds the five header metrics with YTD comparison and the CIRBE variant", async () => {
    const { computeKpis } = await import("../kpis/engine.ts");
    const { kpiTiles } = await import("./present.ts");
    const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
    const ytd = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-08-31" }).data;
    const tiles = kpiTiles({ statement: closed, kpis: computeKpis(closed) }, { statement: ytd, kpis: computeKpis(ytd) }, 245_000);
    // The default row first, then the tiles the «Indicadores» settings can add.
    expect(tiles.slice(0, 5).map((t) => t.label)).toEqual(["DSCR", "Cobertura int.", "DFN / EBITDA", "Liquidez", "DSO / DPO"]);
    expect(tiles.slice(5).map((t) => t.id)).toEqual(["revenue", "ebitda", "debtToEquity", "workingCapital", "financialDebt"]);
    const { pickTiles } = await import("./present.ts");
    expect(pickTiles(tiles, ["dsoDpo", "revenue", "nope"]).map((t) => t.id)).toEqual(["dsoDpo", "revenue"]);
    expect(tiles.find((t) => t.id === "ebitda")!.sub).toMatch(/^margen /);
    expect(tiles[2].value).toBe(0.65);
    expect(tiles[2].sub).toMatch(/^con CIRBE · libros /);
    expect(tiles[0].sub).toMatch(/^YTD /);
    expect(tiles[3].sub).toMatch(/^ácida /);
    expect(tiles[4].secondary).not.toBeNull();
    expect(tiles.every((t) => t.details.length > 0)).toBe(true);
    expect(kpiTiles(null, null, null)).toEqual([]);
  });

  it("adds one tile per bank KPI after the books tiles, also without statements", async () => {
    const { kpiTiles, pickTiles } = await import("./present.ts");
    const { caseViewSample } = await import("../__fixtures__/case-view-sample.ts");
    const bank = caseViewSample.bank!;
    const tiles = kpiTiles(null, null, null, bank);
    expect(tiles).toHaveLength(16);
    const [low, days] = pickTiles(tiles, ["minBalance", "daysCashOnHand"]);
    expect(low.sub).toMatch(/^el \d+ \w+ 2026$/);
    expect(days.unit).toBe("days");
    expect(days.details[0].period).toMatch(/^Extractos 1 ene 2026 – 31 mar 2026$/);
    expect(pickTiles(tiles, ["inflowOutflowRatio"])[0].sub).toBe("últimos 90 días");
    expect(pickTiles(tiles, ["receiptsPerMonth"])[0].sub).toBe("90 días");
  });
});
