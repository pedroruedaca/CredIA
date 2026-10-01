import { describe, expect, it } from "vitest";
import { analystCompletesCase, analystPending, companyPending, matchesFilter, parseFilter, type FilterableCase } from "./attention.ts";

const reqs = [
  { doc_kind: "trial_balance", required: true, source: "borrower" },
  { doc_kind: "norma43", required: true, source: "borrower" },
  { doc_kind: "cirbe", required: true, source: "lender" },
  { doc_kind: "solvency_report", required: false, source: "lender" },
];
const kase = (over: Partial<FilterableCase> = {}): FilterableCase => ({ status: "awaiting_documents", case_requirements: reqs, documents: [], holded_connections: [], ...over });

describe("who a case waits on", () => {
  it("lists the analyst's required documents still missing, apart from the company's", () => {
    expect(analystPending(reqs, [])).toEqual(["cirbe"]);
    expect(analystPending(reqs, [{ kind: "cirbe", status: "parsing" }])).toEqual([]);
    expect(analystPending(reqs, [{ kind: "cirbe", status: "failed" }])).toEqual(["cirbe"]);
    expect(companyPending(reqs, [{ kind: "norma43", status: "parsed" }], [{ status: "synced" }])).toEqual([]);
    expect(companyPending(reqs, [], [])).toEqual(["trial_balance", "norma43"]);
  });

  it("reads the pre-0017 'cif' source as the analyst's", () => {
    expect(analystPending([{ doc_kind: "cuentas_anuales", required: true, source: "cif" }], [])).toEqual(["cuentas_anuales"]);
  });

  it("completes a case with nothing for the company once the analyst's documents are in", () => {
    const mine = [{ doc_kind: "cirbe", required: true, source: "lender" }, { doc_kind: "modelo200", required: false, source: "lender" }];
    expect(analystCompletesCase(mine, [])).toBe(false);
    expect(analystCompletesCase(mine, [{ kind: "cirbe", status: "uploaded" }])).toBe(true);
    expect(analystCompletesCase(reqs, [{ kind: "cirbe", status: "parsed" }])).toBe(false); // the company still has documents
    expect(analystCompletesCase([{ doc_kind: "cirbe", required: false, source: "lender" }], [])).toBe(false); // nothing uploaded yet
  });
});

describe("case list filters", () => {
  it("«Requieren tu atención»: documents the analyst owes, packages to review, documents to check", () => {
    expect(matchesFilter(kase(), "atencion")).toBe(true); // owes the CIRBE
    expect(matchesFilter(kase({ documents: [{ kind: "cirbe", status: "parsed" }] }), "atencion")).toBe(false);
    expect(matchesFilter(kase({ status: "ready", documents: [{ kind: "cirbe", status: "parsed" }] }), "atencion")).toBe(true);
    expect(matchesFilter(kase({ status: "needs_review", documents: [{ kind: "cirbe", status: "parsed" }] }), "atencion")).toBe(true);
    expect(matchesFilter(kase({ status: "processing", documents: [{ kind: "cirbe", status: "parsed" }] }), "atencion")).toBe(false);
  });

  it("«Esperando a la empresa» only when the company has something to provide", () => {
    expect(matchesFilter(kase(), "empresa")).toBe(true);
    expect(matchesFilter(kase({ case_requirements: [{ doc_kind: "cirbe", required: true, source: "lender" }] }), "empresa")).toBe(false);
    expect(matchesFilter(kase({ status: "ready" }), "empresa")).toBe(false);
  });

  it("parses the URL filter, defaulting to all", () => {
    expect(parseFilter("atencion")).toBe("atencion");
    expect(parseFilter(["empresa"])).toBe("empresa");
    expect(parseFilter("x")).toBe("todos");
    expect(parseFilter(undefined)).toBe("todos");
  });
});
