import { describe, expect, it } from "vitest";
import { completeness, isRequirementMet } from "./requirements.ts";

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
  it("a case with no required documents is complete", () => {
    expect(completeness([{ doc_kind: "cirbe", required: false }], [], [])).toEqual({ done: 0, total: 0, pct: 100 });
  });
});
