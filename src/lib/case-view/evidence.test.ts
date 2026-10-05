import { describe, expect, it } from "vitest";
import { n43BankA, n43BankB } from "../__fixtures__/n43-two-banks.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { classifyAccounts } from "../bank/classify.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { checkCirbeVsBooks, checkN43InflowsVsRevenue } from "../checks/engine.ts";
import { buildStatement } from "../pgc/mapping.ts";
import type { CirbeExtraction } from "../schema/canonical.ts";
import { checkSlugs, evidenceView, formatEvidenceValue } from "./evidence.ts";
import type { CheckRow } from "./present.ts";

const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
const cirbe: CirbeExtraction = {
  nif: "B12345674",
  asOf: "2025-12-31",
  positions: [
    { entity: "Banco A", product: "préstamo", drawn: 140_000, limit: null, overdue: 0, maturity: null, page: 2 },
    { entity: "Banco B", product: "crédito", drawn: 20_000, limit: 50_000, overdue: 0, maturity: null, page: 2 },
    { entity: "Entidad C", product: "préstamo ICO", drawn: 60_000, limit: null, overdue: 0, maturity: null, page: 2 },
    { entity: "Entidad D", product: "arrendamiento", drawn: 25_000, limit: null, overdue: 0, maturity: null, page: 3 },
  ],
};
const row = (r: ReturnType<typeof checkCirbeVsBooks>[number], id = 1): CheckRow & { slug: string } => ({
  id, check_key: r.key, status: r.status, severity: r.severity, message: r.message, evidence: r.evidence, source: "engine", document_id: null, slug: r.key,
});

describe("evidenceView", () => {
  it("CIRBE vs books: signed delta, two bars with the gap highlighted, positions and book accounts", () => {
    const v = evidenceView(row(checkCirbeVsBooks(closed, cirbe, "c1")[0]), { closed, ytd: null, cirbe });
    expect(v.headline).toEqual({ value: 85_000, unit: "EUR", signed: true, caption: "de deuda en CIRBE que no aparece en libros" });
    expect(v.compare).toEqual([
      { label: "Libros", value: 160_000, highlight: undefined },
      { label: "CIRBE", value: 245_000, highlight: 85_000 },
    ]);
    expect(v.table?.rows.map((r) => r.label)).toEqual(["Banco A · préstamo", "Banco B · crédito", "Entidad C · préstamo ICO", "Entidad D · arrendamiento"]);
    expect(v.values.some((x) => x.label.startsWith("Cuenta 520"))).toBe(true);
    expect(v.evidenceLine).toBe("CIRBE 245 k€ · libros 160 k€ · CIRBE 31 dic 2025");
    expect(v.gaps[0]).toMatch(/no se empareja/);
    expect(v.severity).toBe("high");
  });

  it("bank receipts vs sales: what came in, by type, counted or left out", () => {
    const accounts = classifyAccounts([...parseNorma43(n43BankA, { docId: "a" }).data, ...parseNorma43(n43BankB, { docId: "b" }).data]);
    const q1 = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-03-31" }).data;
    const ytd = { ...q1, incomeStatement: { ...q1.incomeStatement, revenue: 72_000 } };
    const v = evidenceView(row(checkN43InflowsVsRevenue(ytd, accounts)), { closed: null, ytd, cirbe: null });
    expect(v.table?.title).toBe("Ingresos en banco por tipo");
    expect(v.table?.rows.map((r) => r.label)).toEqual([
      "Cobros de clientes identificados",
      "Ingresos sin clasificar (contados)",
      "Recibos devueltos (restados)",
      "Traspasos entre cuentas propias (no cuentan)",
      "Préstamos y pólizas (no cuentan)",
      "Anticipos, factoring y descuento (no cuentan)",
      "Aportaciones de socios (no cuentan)",
      "Devoluciones (no cuentan)",
    ]);
    expect(v.table?.rows.find((r) => r.label.startsWith("Ingresos sin clasificar"))?.mismatch).toBe(true);
    expect(v.values.map((x) => x.label)).not.toContain("Préstamos y pólizas (no cuentan)");
    expect(v.compare?.map((c) => c.value)).toEqual([87_120, 86_707.35]);
  });

  it("falls back to text and values, listing the gap, for checks without a structured view", () => {
    const v = evidenceView(
      { id: 9, check_key: "holded_opening_reconstructed", status: "fail", severity: "warn", message: "Apertura reconstruida.", evidence: { values: { accounts: 12 }, sources: [] }, source: "holded", document_id: null, slug: "x" },
      { closed, ytd: null, cirbe: null },
    );
    expect(v.headline).toBeNull();
    expect(v.values).toEqual([{ label: "Cuentas", value: "12" }]);
    expect(v.gaps).toHaveLength(2);
  });

  it("bank inflows: percentage delta against revenue with VAT", () => {
    const account = {
      accountMasked: "ES** 0001", bankCode: "0049", start: "2025-01-01", end: "2025-12-31", openingBalance: 0, closingBalance: 0, currency: "EUR",
      transactions: [{ bookingDate: "2025-06-01", valueDate: "2025-06-01", amount: 834_900, conceptCode: "02", description: "cobro", category: "customer_receipt", counterparty: null, sourceRef: "doc:n1:line:3" }],
    };
    const r = checkN43InflowsVsRevenue(closed, [account as never]);
    const v = evidenceView({ ...row(r as never), check_key: r.key }, { closed, ytd: null, cirbe: null });
    expect(v.headline).toMatchObject({ value: -31, unit: "%", signed: true });
    expect(v.compare?.map((c) => c.label)).toEqual(["Ventas + IVA", "Cobros"]);
  });
});

describe("pipeline warnings as checks", () => {
  it("overdrawn bank account: amount headline, account line and its ledger row as source", async () => {
    const { buildStatement: build } = await import("../pgc/mapping.ts");
    const w = build(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).warnings.find((x) => x.code === "overdrawn_bank_account")!;
    expect(w.detail).toMatchObject({ account: "57200002", amount: 20_000 });
    expect(w.message).toContain("20.000 €");
    const v = evidenceView(
      { id: 1, check_key: w.code, status: "fail", severity: "warn", message: w.message, evidence: { values: { account: "57200002", amount: 20_000 }, sources: [String(w.detail!.source_ref)] }, source: "engine", document_id: null, slug: w.code },
      { closed, ytd: null, cirbe: null },
    );
    expect(v.headline).toMatchObject({ value: 20_000, unit: "EUR" });
    expect(v.evidenceLine).toBe("Cuenta 572·00002");
    expect(v.gaps).toEqual([]);
  });
});

describe("helpers", () => {
  it("formats evidence values by kind", () => {
    expect(formatEvidenceValue("cirbe_drawn", 245000)).toBe("245.000 €");
    expect(formatEvidenceValue("cirbe_as_of", "2026-08-31")).toBe("31 ago 2026");
    expect(formatEvidenceValue("ratio", 0.69)).toBe("0,69 x");
    expect(formatEvidenceValue("vat_rate", 0.21)).toBe("21 %");
    expect(formatEvidenceValue("age_days", 12)).toBe("12");
    expect(formatEvidenceValue("result", "al_corriente")).toBe("Al corriente");
    expect(formatEvidenceValue("x", null)).toBe("—");
  });
  it("gives repeated keys stable, distinct slugs", () => {
    expect(checkSlugs([{ check_key: "a" }, { check_key: "b" }, { check_key: "a" }]).map((c) => c.slug)).toEqual(["a", "b", "a-2"]);
  });
});
