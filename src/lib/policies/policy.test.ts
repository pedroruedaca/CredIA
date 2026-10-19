import { describe, expect, it } from "vitest";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { computeKpis, type Kpi } from "../kpis/engine.ts";
import type { BankKpiSet } from "../kpis/bank.ts";
import { buildStatement } from "../pgc/mapping.ts";
import type { PolicyParameter, ResolvedParameter } from "./parameters.ts";
import { criteriaToStored, evaluatePolicy, metricUnit, missingCaseParameters, normalizeCriteria, parsePolicyForm, parseThreshold, type PolicyCriterion } from "./policy.ts";

// tb-small-sl (hand-checked): DSCR 1,59x, cobertura 12,22x, liquidez 1,91x, deuda/patrimonio 0,72x, margen EBITDA 11 %, DSO 45 días.
const closed = computeKpis(buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data);
const bank: BankKpiSet = {
  period: { start: "2025-07-01", end: "2026-06-30", days: 365, fullMonths: 12 },
  accounts: 1,
  sources: ["doc:n43"],
  coverageNote: null,
  kpis: [
    { key: "overdraftDays", value: 3, unit: "count", formula: "x", inputs: {} },
    { key: "minBalance", value: null, unit: "EUR", formula: "x", inputs: {}, note: "Sin saldos en el extracto" },
  ],
};

const c = (metric: PolicyCriterion["metric"], op: PolicyCriterion["op"], threshold: number, period: PolicyCriterion["period"] = "base"): PolicyCriterion => ({ metric, op, threshold, period });

describe("parseThreshold", () => {
  it("reads Spanish and plain numbers, with or without units", () => {
    expect(parseThreshold("1,25")).toBe(1.25);
    expect(parseThreshold("1.25")).toBe(1.25);
    expect(parseThreshold("-50.000")).toBe(-50_000);
    expect(parseThreshold("1.234.567,5")).toBe(1_234_567.5);
    expect(parseThreshold("12,5 %")).toBe(12.5);
    expect(parseThreshold("3x")).toBe(3);
    expect(parseThreshold(" 60 días")).toBe(60);
    expect(parseThreshold(2)).toBe(2);
  });
  it("refuses what is not a number", () => {
    expect(parseThreshold("")).toBeNull();
    expect(parseThreshold("alto")).toBeNull();
    expect(parseThreshold(Number.NaN)).toBeNull();
    expect(parseThreshold(null)).toBeNull();
  });
});

describe("normalizeCriteria", () => {
  it("keeps valid criteria and drops unknown metrics, operators and thresholds", () => {
    expect(
      normalizeCriteria([
        { metric: "dscr", op: "gte", threshold: "1,2", period: "closed" },
        { metric: "score", op: "gte", threshold: 1 },
        { metric: "dscr", op: "eq", threshold: 1 },
        { metric: "dso", op: "lte", threshold: "x" },
        { metric: "overdraftDays", op: "lte", threshold: 5, period: "ytd" },
      ]),
    ).toEqual([c("dscr", "gte", 1.2, "closed"), c("overdraftDays", "lte", 5, "base")]);
    expect(normalizeCriteria("nope")).toEqual([]);
  });
});

describe("parsePolicyForm", () => {
  it("parses name, description and criteria", () => {
    const r = parsePolicyForm({ name: "  Factoring   pyme ", description: "", criteria: JSON.stringify([{ metric: "dscr", op: "gte", threshold: "1,2", period: "base" }]) });
    expect(r).toEqual({ ok: true, data: { name: "Factoring pyme", description: null, criteria: [c("dscr", "gte", 1.2)] } });
  });
  it("asks for a name and at least one criterion with a numeric threshold", () => {
    const r = parsePolicyForm({ name: "x", criteria: "[]" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["criteria", "name"]);
    const bad = parsePolicyForm({ name: "Política", criteria: JSON.stringify([{ metric: "dscr", op: "gte", threshold: "" }]) });
    expect(!bad.ok && bad.errors.criteria).toMatch(/umbral/);
  });
});

describe("evaluatePolicy", () => {
  const inputs = { closed, ytd: [] as Kpi[], bank };

  it("is within the policy when every criterion is met", () => {
    const r = evaluatePolicy([c("dscr", "gte", 1.25), c("debtToEquity", "lte", 1), c("ebitdaMargin", "gte", 8), c("overdraftDays", "lte", 5)], inputs);
    expect(r.outcome).toBe("within");
    expect(r.met).toBe(4);
    expect(r.results.map((x) => [x.value, x.source])).toEqual([[1.59, "closed"], [0.72, "closed"], [11, "closed"], [3, "bank"]]);
  });

  it("is outside the policy when one criterion is not met, even with others missing data", () => {
    const r = evaluatePolicy([c("dscr", "gte", 2), c("currentRatio", "gte", 1.5), c("minBalance", "gte", 0)], inputs);
    expect(r.outcome).toBe("outside");
    expect(r.results.map((x) => x.status)).toEqual(["not_met", "met", "no_data"]);
    expect(r.results[2].note).toBe("Sin saldos en el extracto");
  });

  it("cannot conclude when nothing fails but some criteria have no data", () => {
    const r = evaluatePolicy([c("dso", "lte", 60), c("dscr", "gte", 1.2, "ytd")], inputs);
    expect(r.outcome).toBe("incomplete");
    expect(r.results[1]).toMatchObject({ status: "no_data", source: null });
  });

  it("reads the year to date as the base period when there is no closed year", () => {
    const r = evaluatePolicy([c("dscr", "gte", 1.5)], { closed: [], ytd: closed, bank: null });
    expect(r.results[0]).toMatchObject({ status: "met", source: "ytd" });
  });

  it("treats a threshold equal to the value as met", () => {
    expect(evaluatePolicy([c("dso", "lte", 45), c("dso", "gte", 45)], inputs).outcome).toBe("within");
  });

  it("gives every metric a unit", () => {
    expect(metricUnit("ebitdaMargin")).toBe("%");
    expect(metricUnit("adjustedGrossMargin")).toBe("%");
    expect(metricUnit("overdraftDays")).toBe("count");
    expect(metricUnit("daysCashOnHand")).toBe("days");
    expect(metricUnit("revenue")).toBe("EUR");
  });
});

describe("thresholds from parameters", () => {
  const AMOUNT = "11111111-1111-4111-8111-111111111111";
  const DSCR = "22222222-2222-4222-8222-222222222222";
  const revenue = closed.find((k) => k.key === "revenue")!.value!;
  const k = { closed, ytd: [] as Kpi[], bank: null };
  const amount = (value: number | null): ResolvedParameter => ({ id: AMOUNT, name: "Importe solicitado", unit: "EUR", scope: "case", value, sourceRef: value === null ? null : `case_param:c:${AMOUNT}` });
  const dscrMin: ResolvedParameter = { id: DSCR, name: "DSCR mínimo", unit: "x", scope: "fixed", value: 1.25, sourceRef: `param:${DSCR}` };
  const viaAmount: PolicyCriterion = { metric: "revenue", op: "gte", period: "base", parameter: { id: AMOUNT, factor: 4 } };

  it("stores and reads a criterion on a parameter (factor 1 when empty, never ≤ 0)", () => {
    expect(normalizeCriteria(criteriaToStored([viaAmount]))).toEqual([viaAmount]);
    expect(normalizeCriteria([{ metric: "dscr", op: "gte", parameter_id: DSCR, factor: "" }])).toEqual([{ metric: "dscr", op: "gte", period: "base", parameter: { id: DSCR, factor: 1 } }]);
    expect(normalizeCriteria([{ metric: "dscr", op: "gte", parameter_id: DSCR, factor: "-2" }])).toEqual([]);
  });

  it("compares the KPI with factor × the parameter's value for the case", () => {
    const met = evaluatePolicy([viaAmount], k, [amount(revenue / 4)]);
    expect(met.results[0]).toMatchObject({ status: "met", limit: revenue, parameter: { name: "Importe solicitado", factor: 4 } });
    expect(evaluatePolicy([viaAmount], k, [amount(revenue / 4 + 1)]).outcome).toBe("outside");
    expect(evaluatePolicy([{ metric: "dscr", op: "gte", period: "base", parameter: { id: DSCR, factor: 1 } }], k, [dscrMin]).results[0]).toMatchObject({ status: "met", limit: 1.25 });
  });

  it("a per-case value the case lacks, or a deleted parameter, is «sin datos» with the reason", () => {
    const missing = evaluatePolicy([viaAmount], k, [amount(null)]);
    expect(missing.outcome).toBe("incomplete");
    expect(missing.results[0]).toMatchObject({ status: "no_data", limit: null, note: "Falta «Importe solicitado» en este caso." });
    expect(missingCaseParameters([viaAmount], [amount(null), dscrMin]).map((p) => p.id)).toEqual([AMOUNT]);
    expect(evaluatePolicy([viaAmount], k, []).results[0]).toMatchObject({ status: "no_data", note: "El parámetro de este criterio ya no existe." });
  });

  it("the form refuses a parameter in another unit, an unknown one and a non-positive factor", () => {
    const lenderParams: PolicyParameter[] = [
      { id: AMOUNT, name: "Importe solicitado", description: null, unit: "EUR", scope: "case", value: null },
      { id: DSCR, name: "DSCR mínimo", description: null, unit: "x", scope: "fixed", value: 1.25 },
    ];
    const form = (rows: unknown[]) => parsePolicyForm({ name: "Circulante", criteria: JSON.stringify(rows) }, lenderParams);
    expect(form([{ metric: "revenue", op: "gte", parameter_id: AMOUNT, factor: "4" }])).toMatchObject({ ok: true });
    expect(form([{ metric: "dscr", op: "gte", parameter_id: AMOUNT, factor: "1" }])).toMatchObject({ ok: false, errors: { criteria: expect.stringMatching(/misma unidad/) } });
    expect(form([{ metric: "revenue", op: "gte", parameter_id: "33333333-3333-4333-8333-333333333333", factor: "1" }])).toMatchObject({ ok: false, errors: { criteria: expect.stringMatching(/ya no existe/) } });
    expect(form([{ metric: "revenue", op: "gte", parameter_id: AMOUNT, factor: "0" }])).toMatchObject({ ok: false, errors: { criteria: expect.stringMatching(/factor/) } });
  });
});
