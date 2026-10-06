import { describe, expect, it } from "vitest";
import { n43Sample } from "../__fixtures__/n43-sample.ts";
import { n43BankA, n43BankB, TWO_BANKS_COMPANY } from "../__fixtures__/n43-two-banks.ts";
import { classifyAccounts } from "../bank/classify.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { buildStatement } from "../pgc/mapping.ts";
import { solvencyWireSample } from "../__fixtures__/solvency-report.ts";
import { assessExtraction } from "../extract/assess.ts";
import { modelo303Wire } from "../__fixtures__/modelo303.ts";
import type { Modelo303Wire } from "../extract/schemas.ts";
import type { SolvencyReport } from "../schema/canonical.ts";
import type { CirbeExtraction, Modelo200Extraction } from "../schema/canonical.ts";
import {
  checkSolvencyReport,
  checkCertificate,
  checkCirbeVsBooks,
  checkDebtPaymentsVsDeclaredDebt,
  checkModelo200VsBooks,
  checkModelo303Quarters,
  checkFinancingInflows,
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

describe("Norma 43 checks: two banks, money in that is not sales", () => {
  const accounts = classifyAccounts([...parseNorma43(n43BankA, { docId: "a" }).data, ...parseNorma43(n43BankB, { docId: "b" }).data], { companyName: TWO_BANKS_COMPANY });
  const q1 = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-03-31" }).data;
  // Q1 sales of 72.000 € (87.120 € with VAT): what the bank should show as customer receipts.
  const ytd = { ...q1, incomeStatement: { ...q1.incomeStatement, revenue: 72_000 } };

  it("counts customer receipts only, and lists what it left out", () => {
    const r = checkN43InflowsVsRevenue(ytd, accounts);
    expect(r.status).toBe("pass"); // counting every inflow (372.107 €) would have been +327 %
    expect(r.evidence.values).toMatchObject({
      bank_inflows: 86_707.35,
      identified_receipts: 87_697.35,
      unclassified_inflows: 1_430,
      returned_receipts: 2_420,
      excluded_financing: 150_000,
      excluded_trade_finance: 34_680,
      excluded_equity: 60_000,
      excluded_internal_transfer: 35_000,
      excluded_refund: 3_300,
      total_bank_inflows: 372_107.35,
    });
    expect(r.message).toContain("No se cuentan 282.980 € de traspasos, financiación y otros ingresos que no son ventas.");
    expect(r.evidence.rule).toMatch(/No cuentan como cobros: traspasos/);
  });

  it("says when much of what it counted is unidentified", () => {
    const vague = classifyAccounts(parseNorma43(n43BankA, { docId: "a" }).data);
    for (const t of vague[0].transactions) if (t.category === "customer_receipt") Object.assign(t, { category: "other_inflow" });
    expect(checkN43InflowsVsRevenue(ytd, vague).message).toMatch(/son ingresos sin identificar/);
  });

  it("flags loans and advances arriving without declared debt (high), and states them when there is debt", () => {
    const none = checkFinancingInflows(accounts, null, null);
    expect(none).toMatchObject({ status: "fail", severity: "high" });
    expect(none.message).toBe("Entran 150.000 € de préstamos o pólizas y 34.680 € de anticipos, factoring o descuento en los extractos, pero no consta deuda financiera ni en contabilidad ni en CIRBE.");
    expect(checkFinancingInflows(accounts, closed, null)).toMatchObject({ status: "pass", severity: "info" });
    expect(checkFinancingInflows(parseNorma43(n43Sample, { docId: "n1" }).data, null, null).status).toBe("not_applicable");
  });

  it("counts interest on credit lines as debt payments", () => {
    const r = checkDebtPaymentsVsDeclaredDebt(accounts, null, null);
    expect(r.evidence.values).toMatchObject({ debt_payments: 3_425.25, months_with_payments: 2 });
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

describe("checkSolvencyReport", () => {
  const report = (assessExtraction("solvency_report", solvencyWireSample, { fileName: "x.pdf", caseCif: "B12345674", companyName: "X", lenderName: "L", expectedFiscalYear: null }).canonical as { data: SolvencyReport }).data;
  const byKey = (checks: ReturnType<typeof checkSolvencyReport>) => Object.fromEntries(checks.map((c) => [c.key, c]));

  it("flags active payment incidents (not the paid one) and an open AEAT claim, and matches revenue with the books", () => {
    const c = byKey(checkSolvencyReport(report, "d1", closed));
    expect(c.solvency_payment_incidents).toMatchObject({ status: "fail", severity: "high", evidence: { values: { incidents: 1, amount: 4200.5 }, sources: ["doc:d1:page:4"] } });
    expect(c.solvency_payment_incidents.message).toBe("El informe de Experian recoge 1 incidencia de pago activa por 4.201 €.");
    expect(c.solvency_judicial).toMatchObject({ status: "fail", severity: "warn", evidence: { sources: ["doc:d1:page:5"] } });
    expect(c.solvency_vs_books_revenue).toMatchObject({ status: "pass", evidence: { values: { fiscal_year: 2025, report: 1_000_000 } } });
  });

  it("an embargo or concurso is high; a clean report passes; revenue far from the books warns", () => {
    const clean: SolvencyReport = { ...report, incidents: [], incidentsTotal: { count: 0, amount: null, page: 4 }, judicial: [] };
    expect(checkSolvencyReport(clean, "d1", null).map((x) => `${x.key}:${x.status}`)).toEqual(["solvency_payment_incidents:pass", "solvency_judicial:pass"]);
    const seized: SolvencyReport = { ...clean, judicial: [{ type: "embargo", description: "Embargo TGSS", amount: 8_000, date: null, status: "active", page: 5 }] };
    expect(byKey(checkSolvencyReport(seized, "d1", null)).solvency_judicial).toMatchObject({ status: "fail", severity: "high" });
    const off: SolvencyReport = { ...clean, financials: [{ ...report.financials[0], revenue: 700_000 }] };
    expect(byKey(checkSolvencyReport(off, "d1", closed)).solvency_vs_books_revenue).toMatchObject({ status: "fail", severity: "warn", evidence: { values: { difference: 300_000 } } });
  });

  it("uses the summary count when the report lists no detail; never turns the provider's rating into a check", () => {
    const summaryOnly: SolvencyReport = { ...report, incidents: [], incidentsTotal: { count: 3, amount: 9_000, page: 2 } };
    expect(byKey(checkSolvencyReport(summaryOnly, "d1", null)).solvency_payment_incidents).toMatchObject({ status: "fail", evidence: { values: { incidents: 3, amount: 9_000 }, sources: ["doc:d1:page:2"] } });
    expect(JSON.stringify(checkSolvencyReport(report, "d1", closed))).not.toMatch(/rating|probabilidad|límite|1\.85|60000/i);
  });
});

describe("checkModelo303Quarters", () => {
  const ret = (year: number, period: Modelo303Wire["period"], uploadedAt = "2026-09-20T10:00:00Z", base21?: number) => {
    const a = assessExtraction("modelo303", modelo303Wire(year, period, base21), { fileName: "303.pdf", caseCif: "B12345674", companyName: "X", lenderName: "Y", expectedFiscalYear: 2025 });
    if (a.canonical?.kind !== "modelo303") throw new Error("fixture not parsed");
    return { docId: `${year}-${period}-${uploadedAt}`, uploadedAt, data: a.canonical.data };
  };
  const TODAY = "2026-10-01"; // last 4 due: 3T 25 .. 2T 26

  it("passes with the last 4 quarters and shows the base per quarter", () => {
    const c = checkModelo303Quarters([ret(2025, "3T"), ret(2025, "4T"), ret(2026, "1T"), ret(2026, "2T")], TODAY);
    expect(c).toMatchObject({ status: "pass", severity: "info", evidence: { values: { "3T 25": 252_000, "2T 26": 252_000 } } });
    expect(c.evidence.sources).toContain("doc:2026-2T-2026-09-20T10:00:00Z:page:2");
  });

  it("warns about the missing quarters; three monthly returns cover a quarter", () => {
    const c = checkModelo303Quarters([ret(2025, "3T"), ret(2026, "04"), ret(2026, "05"), ret(2026, "06")], TODAY);
    expect(c).toMatchObject({ status: "fail", severity: "warn", message: "Faltan el Modelo 303 de 4T 25 y 1T 26." });
    expect(c.evidence.values).toMatchObject({ "4T 25": null, "1T 26": null, "2T 26": 756_000 });
  });

  it("the newest upload of a period wins (complementaria)", () => {
    const c = checkModelo303Quarters([ret(2026, "2T", "2026-09-01T00:00:00Z"), ret(2026, "2T", "2026-09-25T00:00:00Z", 300_000)], TODAY);
    expect(c.evidence.values["2T 26"]).toBe(312_000);
  });

  it("does not apply without returns", () => {
    expect(checkModelo303Quarters([], TODAY).status).toBe("not_applicable");
  });
});

describe("overdrafts and statements without balances", () => {
  it("leaves out accounts whose balances are unknown", async () => {
    const { checkOverdrafts } = await import("./engine.ts");
    const acct = { bank: "", branch: "", accountMasked: "x.csv", currency: "978", start: "2026-01-01", end: "2026-01-31", name: "", openingBalance: 0, closingBalance: null, totals: null, balancesKnown: false, transactions: [{ bookingDate: "2026-01-02", valueDate: "2026-01-02", amount: -500, commonConcept: "", ownConcept: "", document: "", reference1: "", reference2: "", description: "PAGO", category: "operating_payment" as const, sourceRef: "doc:x:row:2" }] };
    expect(checkOverdrafts([acct]).status).toBe("not_applicable"); // 0 − 500 would read as an overdraft
  });
});

describe("bank accounts held by someone else", () => {
  it("are left out until the lender confirms them, and only those uploaded before the confirmation", async () => {
    const { bankHolderCheck } = await import("./engine.ts");
    const acct = (name: string, masked: string) => ({ bank: "", branch: "", accountMasked: masked, currency: "978", start: "2026-01-01", end: "2026-03-31", name, openingBalance: 0, closingBalance: 0, totals: null, transactions: [] });
    const bank = [
      { docId: "a", uploadedAt: "2026-10-01T10:00:00Z", account: acct("COMERCIAL DISTRIBUCIONES LEV", "2100 0418 ****1332") },
      { docId: "b", uploadedAt: "2026-10-01T10:00:00Z", account: acct("JUAN GARCIA LOPEZ", "0049 1500 ****7891") },
    ];
    const company = "Comercial Distribuciones Levante, S.L.";
    const held = bankHolderCheck(bank, company, null);
    expect(held.used.map((b) => b.docId)).toEqual(["a"]);
    expect(held.check).toMatchObject({ key: "bank_holder_mismatch", status: "fail", severity: "warn", evidence: { values: { "0049 1500 ****7891": "JUAN GARCIA LOPEZ" }, sources: ["doc:b"] } });
    expect(held.check!.message).toMatch(/^Una cuenta está a nombre de otro titular y no se usa/);
    const accepted = bankHolderCheck(bank, company, "2026-10-02T09:00:00Z");
    expect(accepted.used).toHaveLength(2);
    expect(accepted.check!.message).toMatch(/confirmadas como de la empresa/);
    expect(bankHolderCheck(bank, company, "2026-09-30T09:00:00Z").used).toHaveLength(1); // uploaded after the review: held again
    expect(bankHolderCheck(bank, null, null)).toEqual({ used: bank, check: null }); // nothing to compare with
    const two = bankHolderCheck([...bank, { ...bank[1], docId: "c", account: acct("MARIA PEREZ", "0182 2200 ****7781") }], company, null);
    expect(two.check!.message).toMatch(/^2 cuentas están a nombre de otro titular y no se usan .* Si son de la empresa, marca esta alerta como revisada y se incluirán\.$/);
  });
});
