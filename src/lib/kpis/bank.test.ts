import { describe, expect, it } from "vitest";
import { classifyAccounts } from "../bank/classify.ts";
import { n43BankA, n43BankB, TWO_BANKS_COMPANY } from "../__fixtures__/n43-two-banks.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { BANK_KPI_KEYS, computeBankKpis, type BankKpiAccount, type BankKpiMovement } from "./bank.ts";

const mv = (bookingDate: string, amount: number, category: BankKpiMovement["category"], categoryRule?: string): BankKpiMovement => ({ bookingDate, amount, category, categoryRule });

/**
 * Hand-checked: account A covers Q1 2026; account B only February and March. Balances by hand:
 * A goes negative on 20 Feb (−4.060) and stays below zero until 10 Mar; with B's 6.000 the combined low is
 * −6.060 from 27 Feb to 1 Mar. Closing 6.040 + 2.000 = 8.040.
 */
const accounts: BankKpiAccount[] = [
  {
    accountMasked: "2100 0418 ****1332",
    start: "2026-01-01",
    end: "2026-03-31",
    openingBalance: 10_000,
    docId: "docA",
    transactions: [
      mv("2026-01-05", 12_100, "customer_receipt"),
      mv("2026-01-28", -8_000, "payroll"),
      mv("2026-01-30", -2_000, "social_security"),
      mv("2026-02-03", -1_000, "debt_service"),
      mv("2026-02-10", 6_050, "customer_receipt"),
      mv("2026-02-15", -1_210, "customer_return"),
      mv("2026-02-20", -20_000, "operating_payment"),
      mv("2026-02-27", -8_000, "payroll"),
      mv("2026-03-02", 5_000, "internal_transfer"),
      mv("2026-03-10", 18_150, "customer_receipt"),
      mv("2026-03-15", 3_000, "refund", "tax_refund"),
      mv("2026-03-27", -8_000, "payroll"),
      mv("2026-03-31", -50, "interest"),
    ],
  },
  {
    accountMasked: "0182 2200 ****7781",
    start: "2026-02-01",
    end: "2026-03-31",
    openingBalance: 6_000,
    docId: "docB",
    transactions: [mv("2026-03-02", -5_000, "internal_transfer"), mv("2026-03-20", 1_000, "refund", "returned")],
  },
];

const byKey = (set: NonNullable<ReturnType<typeof computeBankKpis>>) => Object.fromEntries(set.kpis.map((k) => [k.key, k]));

describe("computeBankKpis", () => {
  it("computes balance, flow and incident KPIs over the window (hand-checked)", () => {
    const set = computeBankKpis(accounts)!;
    expect(set.period).toEqual({ start: "2026-01-01", end: "2026-03-31", days: 90, fullMonths: 3 });
    expect(set.accounts).toBe(2);
    expect(set.sources).toEqual(["doc:docA", "doc:docB"]);
    expect(set.kpis.map((k) => k.key)).toEqual([...BANK_KPI_KEYS]);
    const k = byKey(set);

    expect(k.minBalance.value).toBe(-6_060);
    expect(k.minBalance.note).toMatch(/Mínimo el 27 feb 2026/);
    expect(k.overdraftDays.value).toBe(18); // 20 Feb – 9 Mar
    expect(k.daysCashOnHand.value).toBe(16); // 8.040 / (46.000 / 90)
    expect(k.daysCashOnHand.inputs).toMatchObject({ closingBalance: 8_040, operatingOutflows: 46_000, days: 90 });
    expect(k.operatingCashFlow.value).toBeCloseTo((36_300 - 1_210 - 46_000) / (90 / (365 / 12)), 1);
    expect(k.netBurn.value).toBe(23_160); // February only: 28.000 out vs 4.840 in
    expect(k.netBurn.inputs).toEqual({ burnMonths: 1, fullMonths: 3 });
    expect(k.inflowVolatility.value).toBe(46.5); // receipts 12.100 / 4.840 / 18.150
    expect(k.receiptsPerMonth.value).toBe(1);
    expect(k.debtServiceBurden.value).toBe(3); // 1.050 / 35.090
    expect(k.payrollRegularity.value).toBe(100);
    expect(k.returnedItems.value).toBe(2);
    expect(k.returnedItems.inputs).toEqual({ returnedReceiptCount: 1, returnedDebitCount: 1 });
    expect(k.returnedReceiptsRatio.value).toBe(3.3); // 1.210 / 36.300
    expect(k.publicInflowShare.value).toBe(7.4); // 3.000 / 40.300 (internal transfers left out)
    expect(k.internalTransferShare.value).toBe(11); // 5.000 / 45.300
    expect(k.averageDailyBalance.value).not.toBeNull();
    expect(k.currentToAverage.value).not.toBeNull();
    // B does not cover January: said in the notes.
    expect(set.coverageNote).toMatch(/0182 2200 \*\*\*\*7781/);
    expect(k.minBalance.note).toMatch(/no cubren todo el periodo/);
  });

  it("joins consecutive files of the same account", () => {
    const [a] = accounts;
    const jan = { ...a, end: "2026-01-31", transactions: a.transactions.filter((t) => t.bookingDate < "2026-02-01") };
    const rest = { ...a, start: "2026-02-01", openingBalance: 12_100, transactions: a.transactions.filter((t) => t.bookingDate >= "2026-02-01") };
    const whole = byKey(computeBankKpis([a])!);
    const split = computeBankKpis([jan, rest])!;
    expect(split.accounts).toBe(1);
    expect(split.coverageNote).toBeNull();
    expect(byKey(split).minBalance.value).toBe(whole.minBalance.value);
    expect(byKey(split).operatingCashFlow.value).toBe(whole.operatingCashFlow.value);
  });

  it("needs four weeks of movements, and something to read", () => {
    const short = computeBankKpis([{ ...accounts[0], end: "2026-01-20" }])!;
    expect(short.kpis.every((k) => k.value === null)).toBe(true);
    expect(short.kpis[0].note).toMatch(/hacen falta al menos 28/);
    expect(computeBankKpis([])).toBeNull();
  });

  it("reads the two-bank Norma 43 fixture after classification", () => {
    const parsed = [n43BankA, n43BankB].flatMap((f, i) => parseNorma43(f, { docId: `d${i}` }).data.map((a) => ({ ...a, docId: `d${i}` })));
    classifyAccounts(parsed, { companyName: TWO_BANKS_COMPANY });
    const set = computeBankKpis(parsed)!;
    expect(set.period.fullMonths).toBe(3);
    expect(set.coverageNote).toBeNull();
    const k = byKey(set);
    // The loan, the advances and the capital increase are not receipts; the VAT refund is public money.
    expect(k.publicInflowShare.inputs.publicRefunds).toBe(3_300);
    expect(k.internalTransferShare.value).toBeGreaterThan(0);
    expect(k.returnedItems.inputs.returnedReceiptCount).toBe(1);
    expect(k.debtServiceBurden.value).toBeGreaterThan(0);
    expect(k.overdraftDays.value).toBe(0);
  });
});
