import { describe, expect, it } from "vitest";
import { completeness, isRequirementMet, REQUIREMENT_MODULES } from "./requirements.ts";

const reqs = [
  { doc_kind: "trial_balance", required: true },
  { doc_kind: "norma43", required: true },
  { doc_kind: "cirbe", required: true },
  { doc_kind: "cuentas_anuales", required: false },
];

describe("completeness", () => {
  it("counts only required documents that were provided", () => {
    const docs = [
      { kind: "norma43", status: "parsed" },
      { kind: "cirbe", status: "failed" },
      { kind: "cuentas_anuales", status: "parsed" },
    ];
    expect(completeness(reqs, docs, [])).toEqual({ done: 1, total: 3, pct: 33 });
  });
  it("a synced Holded connection satisfies the accounting requirement", () => {
    expect(isRequirementMet("trial_balance", [], [{ status: "synced" }])).toBe(true);
    expect(isRequirementMet("trial_balance", [], [{ status: "invalid_key" }])).toBe(false);
    expect(isRequirementMet("norma43", [], [{ status: "synced" }])).toBe(false);
  });
  it("needs_review documents are not complete", () => {
    expect(isRequirementMet("cirbe", [{ kind: "cirbe", status: "needs_review" }], [])).toBe(false);
  });
  it("documents the analyst uploads do not count against the company (\"cif\" is the value before 0017)", () => {
    expect(completeness([...reqs, { doc_kind: "solvency_report", required: true, source: "lender" }, { doc_kind: "aeat_cert", required: true, source: "cif" }], [{ kind: "norma43", status: "parsed" }], [])).toEqual({ done: 1, total: 3, pct: 33 });
  });
  it("a case with no required documents is complete", () => {
    expect(completeness([{ doc_kind: "cirbe", required: false }], [], [])).toEqual({ done: 0, total: 0, pct: 100 });
  });
});

describe("REQUIREMENT_MODULES", () => {
  it("groups the Modelo 200 and the Modelo 303 as «Documentos fiscales»", () => {
    const fiscal = REQUIREMENT_MODULES.find((m) => m.label === "Documentos fiscales")!;
    expect(fiscal.specs.map((s) => s.kind)).toEqual(["modelo200", "modelo303"]);
    expect(REQUIREMENT_MODULES.flatMap((m) => m.specs).length).toBe(9);
    expect(REQUIREMENT_MODULES.map((m) => m.label)).not.toContain("Modelo 200");
  });
});

