import { describe, expect, it } from "vitest";
import { normalizeTemplateRequirements, parseTemplateForm, templateFormValues, templateSummary } from "./templates.ts";
import { parseNewCase } from "./new-case.ts";

describe("process templates", () => {
  it("parses the template form into stored document choices", () => {
    const r = parseTemplateForm({ name: "  Factoring pyme ", description: "", product: "", req_trial_balance: "required", req_cirbe: "lender", req_tgss_cert: "optional", age_tgss_cert: "60" });
    expect(r).toEqual({
      ok: true,
      data: {
        name: "Factoring pyme",
        description: null,
        product: null,
        requirements: [
          { kind: "trial_balance", level: "required", maxAgeDays: null },
          { kind: "cirbe", level: "lender", maxAgeDays: null },
          { kind: "tgss_cert", level: "optional", maxAgeDays: 60 },
        ],
      },
    });
  });

  it("asks for a name and at least one document, and a known product", () => {
    const r = parseTemplateForm({ name: "x", product: "bitcoin" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["name", "product", "requirements"]);
  });

  it("round-trips: a template fills the case form with the same documents", () => {
    const t = normalizeTemplateRequirements([
      { kind: "norma43", level: "required", maxAgeDays: null },
      { kind: "solvency_report", level: "lender", maxAgeDays: 30 },
    ]);
    const values = templateFormValues(t);
    expect(values.req_cirbe).toBe("none");
    expect(values.age_solvency_report).toBe("30");
    expect(values.age_tgss_cert).toBe("90"); // default max age kept for documents not in the template
    const c = parseNewCase({ cif: "B12345674", name: "Demo SL", amount: "1000", product: "poliza_circulante", termMonths: "12", fiscalYearEnd: "2025-12-31", borrowerEmail: "a@b.es", ...values });
    expect(c.ok && c.data.requirements).toEqual([
      { kind: "norma43", required: true, maxAgeDays: null, source: "borrower" },
      { kind: "solvency_report", required: true, maxAgeDays: 30, source: "lender" },
    ]);
  });

  it("normalises stored requirements: unknown kinds and levels out, repeated once, ages only where they apply", () => {
    expect(
      normalizeTemplateRequirements([
        { kind: "cirbe", level: "required", maxAgeDays: 9999 },
        { kind: "scoring", level: "required" },
        { kind: "cirbe", level: "optional" },
        { kind: "norma43", level: "maybe" },
        { kind: "trial_balance", level: "optional", maxAgeDays: 30 },
      ]),
    ).toEqual([
      { kind: "trial_balance", level: "optional", maxAgeDays: null },
      { kind: "cirbe", level: "required", maxAgeDays: null },
    ]);
    expect(normalizeTemplateRequirements("x")).toEqual([]);
  });

  it("summarises a template for lists", () => {
    expect(templateSummary([{ kind: "cirbe", level: "lender", maxAgeDays: null }])).toBe("1 documento · 1 lo subes tú");
    expect(templateSummary([{ kind: "cirbe", level: "required", maxAgeDays: null }, { kind: "norma43", level: "required", maxAgeDays: null }])).toBe("2 documentos");
  });
});
