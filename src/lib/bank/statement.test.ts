import { describe, expect, it } from "vitest";
import { addsUp, maskAccount, parseAmount, parseDate, parseIban, reconcileRows, toN43Account, type StatementRow } from "./statement.ts";

const row = (date: string, amount: number, balance: number | null, n: number): StatementRow => ({ date, amount, balance, description: `mov ${n}`, sourceRef: `doc:d:row:${n}` });

// Opening 1.000; +500, −200, +50 → 1.350.
const ascending = [row("2026-01-02", 500, 1500, 1), row("2026-01-05", -200, 1300, 2), row("2026-01-05", 50, 1350, 3)];

describe("reconcileRows", () => {
  it("oldest first: opening from the first balance, adds up", () => {
    const r = reconcileRows(ascending);
    expect(r).toMatchObject({ order: "ascending", opening: 1000, closing: 1350, balancesKnown: true, mismatches: [], closingMismatch: null });
    expect(addsUp(r)).toBe(true);
  });

  it("newest first (as most banks export): same result, rows in date order", () => {
    const r = reconcileRows([...ascending].reverse());
    expect(r.order).toBe("descending");
    expect(r.opening).toBe(1000);
    expect(r.rows.map((x) => x.sourceRef)).toEqual(["doc:d:row:1", "doc:d:row:2", "doc:d:row:3"]);
    expect(addsUp(r)).toBe(true);
  });

  it("a misread amount is caught once, on its line", () => {
    const bad = [row("2026-01-02", 500, 1500, 1), row("2026-01-05", -280, 1300, 2), row("2026-01-06", 50, 1350, 3)];
    const r = reconcileRows(bad);
    expect(r.mismatches).toEqual([{ sourceRef: "doc:d:row:2", expected: 1220, printed: 1300 }]);
    expect(addsUp(r)).toBe(false);
  });

  it("checks the printed opening and closing balances", () => {
    expect(addsUp(reconcileRows(ascending, { opening: 1000, closing: 1350 }))).toBe(true);
    const r = reconcileRows(ascending, { opening: 1000, closing: 1400 });
    expect(r.closingMismatch).toEqual({ expected: 1350, printed: 1400 });
    expect(addsUp(reconcileRows(ascending, { opening: 900 }))).toBe(false); // 900 + 500 ≠ 1.500
  });

  it("without running balances: flows only", () => {
    const r = reconcileRows(ascending.map((x) => ({ ...x, balance: null })));
    expect(r.balancesKnown).toBe(false);
    expect(r.opening).toBeNull();
    expect(addsUp(r)).toBe(true);
    // A first line without a balance still gives the opening from the next one.
    expect(reconcileRows([{ ...ascending[0], balance: null }, ascending[1], ascending[2]]).opening).toBe(1000);
  });
});

describe("accounts", () => {
  it("reads a Spanish IBAN in any spacing and masks it like Norma 43", () => {
    expect(parseIban("Cuenta: ES91 2100 0418 4502 0005 1332")).toEqual({ iban: "ES9121000418450200051332", bank: "2100", branch: "0418", account: "0200051332" });
    expect(parseIban("ES9121000418450200051332")?.bank).toBe("2100");
    expect(parseIban("IBAN pendiente")).toBeNull();
    expect(maskAccount("2100", "0418", "0200051332")).toBe("2100 0418 ****1332");
  });

  it("builds an account in the Norma 43 shape", () => {
    const a = toN43Account({ iban: "ES9121000418450200051332", holder: "EMPRESA SL", label: "x.csv", rec: reconcileRows(ascending) });
    expect(a).toMatchObject({ bank: "2100", accountMasked: "2100 0418 ****1332", start: "2026-01-02", end: "2026-01-05", openingBalance: 1000, closingBalance: 1350, balancesKnown: true, currency: "978" });
    expect(a.totals).toEqual({ debits: 200, credits: 550, debitCount: 1, creditCount: 2 });
    expect(toN43Account({ iban: null, holder: "", label: "extracto.csv", rec: reconcileRows(ascending) }).accountMasked).toBe("extracto.csv");
  });
});

describe("cell values", () => {
  it("amounts", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("-1.234,56 €")).toBe(-1234.56);
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1234.5")).toBe(1234.5);
    expect(parseAmount("(12,00)")).toBe(-12);
    expect(parseAmount("12,00-")).toBe(-12);
    expect(parseAmount(-45.678)).toBe(-45.68);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("Saldo")).toBeNull();
  });

  it("dates", () => {
    expect(parseDate("31/12/2025")).toBe("2025-12-31");
    expect(parseDate("02-01-26")).toBe("2026-01-02");
    expect(parseDate("2026-01-02")).toBe("2026-01-02");
    expect(parseDate(46023)).toBe("2026-01-01"); // Excel serial (45658 = 1 Jan 2025)
    expect(parseDate(new Date(Date.UTC(2026, 0, 2)))).toBe("2026-01-02");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Fecha")).toBeNull();
  });
});
