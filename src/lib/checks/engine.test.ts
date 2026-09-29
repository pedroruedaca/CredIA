import { describe, expect, it } from "vitest";
import { n43Sample } from "../__fixtures__/n43-sample.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { buildStatement } from "../pgc/mapping.ts";
import type { CirbeExtraction, Modelo200Extraction } from "../schema/canonical.ts";
import {
  checkCertificate,
  checkCirbeVsBooks,
  checkDebtPaymentsVsDeclaredDebt,
  checkModelo200VsBooks,
  checkN43InflowsVsRevenue,
  checkOverdrafts,
  cirbeAnnualPrincipal,
} from "./engine.ts";

// Books: financial debt = 100.000 LP + 40.000 CP + 20.000 overdrawn bank = 160.000 (hand-checked fixture).
const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
const cirbe = (positions: CirbeExtraction["positions"]): CirbeExtraction => ({ nif: "B12345674", asOf: "2025-12-31", positions });
const pos = (drawn: number, product = "préstamo", overdue = 0, maturity: string | null = null) => ({ entity: "Banco A", product, drawn, limit: null, overdue, maturity, page: 2 });

describe("CIRBE vs books", () => {
  const books = closed.derived.financialDebt;
  it("passes within tolerance, ignoring guarantees", () => {
    const [r, overdue] = checkCirbeVsBooks(closed, cirbe([pos(books - 3000), pos(50_000, "Aval técnico")]), "c1");
    expect(r).toMatchObject({ key: "cirbe_vs_books_debt", status: "pass" });
    expect(r.evidence.values.cirbe_drawn).toBe(books - 3000);
    expect(r.evidence.sources).toEqual(expect.arrayContaining(["doc:c1:page:2"]));
    expect(r.evidence.sources.some((s) => s.startsWith("doc:fixture:row:"))).toBe(true);
    expect(overdue.status).toBe("pass");
  });
  it("flags debt in CIRBE missing from the books as high when large", () => {
    const [r] = checkCirbeVsBooks(closed, cirbe([pos(books * 1.6)]), "c1");
    expect(r).toMatchObject({ status: "fail", severity: "high" });
    expect(r.message).toMatch(/sin reflejar en libros/);
  });
  it("flags book debt not in CIRBE as a warning", () => {
    expect(checkCirbeVsBooks(closed, cirbe([pos(books * 0.5)]), "c1")[0]).toMatchObject({ status: "fail", severity: "warn" });
  });
  it("flags overdue risk", () => {
    expect(checkCirbeVsBooks(closed, cirbe([pos(books, "préstamo", 1200)]), "c1")[1]).toMatchObject({ key: "cirbe_overdue", status: "fail", severity: "high" });
  });
  it("derives 12-month principal only when maturities are readable", () => {
    expect(cirbeAnnualPrincipal(cirbe([pos(40_000, "crédito", 0, "Menos de 1 año"), pos(100_000, "préstamo", 0, "3 años")]))).toBe(40_000);
    expect(cirbeAnnualPrincipal(cirbe([pos(40_000)]))).toBeUndefined();
  });
});

describe("Modelo 200 vs closed-year books", () => {
  const m200 = (fields: Partial<Modelo200Extraction["fields"]>): Modelo200Extraction => ({
    nif: "B12345674", fiscalYear: 2025,
    fields: { revenue: 1_000_000, operatingResult: null, preTaxResult: null, netIncome: 71_000, equity: 221_000, totalAssets: null, ...fields },
    sourcePages: { revenue: 4, netIncome: 5, equity: 3 },
  });
  it("passes matching figures and cites the Modelo 200 page", () => {
    const r = checkModelo200VsBooks(closed, m200({}), "m1");
    expect(r.map((c) => c.status)).toEqual(["pass", "pass", "pass"]);
    expect(r[0].evidence.sources).toContain("doc:m1:page:4");
  });
  it("flags a revenue gap above 5 % as high", () => {
    const r = checkModelo200VsBooks(closed, m200({ revenue: 900_000 }), "m1");
    expect(r[0]).toMatchObject({ key: "m200_vs_books_revenue", status: "fail", severity: "high" });
  });
  it("is not applicable when a figure is missing from the return", () => {
    expect(checkModelo200VsBooks(closed, m200({ equity: null }), "m1")[2].status).toBe("not_applicable");
  });
});

describe("Norma 43 checks", () => {
  const accounts = parseNorma43(n43Sample, { docId: "n1" }).data;
  it("compares revenue inflows with pro-rated revenue incl. VAT over the common period", () => {
    const ytd = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-03-31" }).data;
    const r = checkN43InflowsVsRevenue(ytd, accounts);
    expect(r.evidence.values.overlap_months).toBe(3);
    expect(r.evidence.values.expected_from_revenue).toBeCloseTo(1_000_000 * (3 / 3) * 1.21, 0);
    expect(r).toMatchObject({ status: "fail", severity: "warn" }); // the sample file only has ~1 % of that
  });
  it("is not applicable when the statements don't overlap the bank period", () => {
    expect(checkN43InflowsVsRevenue(closed, accounts).status).toBe("not_applicable");
  });
  it("flags overdrawn accounts with the date", () => {
    const r = checkOverdrafts(accounts);
    expect(r).toMatchObject({ status: "fail", severity: "warn" });
    expect(r.message).toContain("2100 0418 ****9876 (-2.200 € el 2026-02-01)");
  });
  it("flags recurring loan payments without declared debt", () => {
    const monthly = parseNorma43(n43Sample, { docId: "n1" }).data;
    monthly[1].transactions.push({ ...monthly[1].transactions[0], bookingDate: "2026-03-01", valueDate: "2026-03-01" });
    expect(checkDebtPaymentsVsDeclaredDebt(monthly, null, null)).toMatchObject({ status: "fail", severity: "high" });
    expect(checkDebtPaymentsVsDeclaredDebt(monthly, closed, null).status).toBe("pass");
    expect(checkDebtPaymentsVsDeclaredDebt(accounts, closed, null).status).toBe("not_applicable"); // one month only
  });
});

describe("certificates", () => {
  const cert = { nif: "B12345674", issuer: "tgss" as const, issuedOn: "2026-09-01", validUntil: null, result: "al_corriente" as const, verificationCode: "X", page: 1 };
  it("passes a recent positive certificate", () => {
    expect(checkCertificate("tgss_cert", cert, "t1", 90, "2026-09-29")).toMatchObject({ status: "pass", evidence: { sources: ["doc:t1:page:1"] } });
  });
  it("flags negative (high), too old or expired (warn)", () => {
    expect(checkCertificate("tgss_cert", { ...cert, result: "no_al_corriente" }, "t1", 90, "2026-09-29").severity).toBe("high");
    expect(checkCertificate("tgss_cert", { ...cert, issuedOn: "2026-03-01" }, "t1", 90, "2026-09-29")).toMatchObject({ status: "fail", severity: "warn" });
    expect(checkCertificate("aeat_cert", { ...cert, issuer: "aeat", validUntil: "2026-09-01" }, "a1", null, "2026-09-29").message).toMatch(/caducó/);
  });
  it("is not applicable without a certificate", () => {
    expect(checkCertificate("aeat_cert", null, null, 90, "2026-09-29").status).toBe("not_applicable");
  });
});
