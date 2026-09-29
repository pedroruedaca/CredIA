import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { a3Rows, contasolCsv, holdedRows, odooRows, sageRows } from "../__fixtures__/tb-exports.ts";
import { tbSmallSl } from "../__fixtures__/tb-small-sl.ts";
import { buildStatement } from "../pgc/mapping.ts";
import type { Period } from "../types.ts";
import { decodeText, parseCsv, readSpreadsheet } from "./spreadsheet.ts";
import { detectMapping, detectPeriod, parseTrialBalance, roleOf, splitAccount, type SheetData } from "./trial-balance.ts";

const FY: Period = { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" };
const expected = buildStatement(tbSmallSl, FY).data;
const sheet = (rows: unknown[][], name = "Hoja1"): SheetData[] => [{ name, rows }];

function parse(sheets: SheetData[], fileName = "sys.xlsx") {
  const r = parseTrialBalance(sheets, { docId: "d1", fileName });
  expect(r.data).not.toBeNull();
  return r;
}

describe("header roles", () => {
  it("recognises Spanish and English column names", () => {
    expect(roleOf("Cuenta")).toBe("account");
    expect(roleOf("Subcuenta")).toBe("account");
    expect(roleOf("Código")).toBe("account");
    expect(roleOf("Account")).toBe("account");
    expect(roleOf("Descripción")).toBe("name");
    expect(roleOf("Título")).toBe("name");
    expect(roleOf("Saldo Anterior")).toBe("opening");
    expect(roleOf("sumas Debe")).toBe("sumDebit");
    expect(roleOf("Haber")).toBe("sumCredit");
    expect(roleOf("saldos Deudor")).toBe("balDebit");
    expect(roleOf("Saldo acreedor")).toBe("balCredit");
    expect(roleOf("Saldo")).toBe("balance");
    expect(roleOf("End Balance")).toBe("balance");
    expect(roleOf("Initial Balance")).toBe("opening");
  });
  it("splits account codes in any common shape", () => {
    expect(splitAccount(43000001)).toEqual({ code: "43000001", rest: "" });
    expect(splitAccount("430.0.0001")).toEqual({ code: "43000001", rest: "" });
    expect(splitAccount("430001 Cliente A")).toEqual({ code: "430001", rest: "Cliente A" });
    expect(splitAccount("Totales")).toBeNull();
    expect(splitAccount("")).toBeNull();
  });
});

describe.each([
  ["A3", () => sheet(a3Rows), "a3", { start: "2025-01-01", end: "2025-12-31" }],
  ["Sage (two-row header)", () => sheet(sageRows), "sage", { start: "2025-01-01", end: "2025-12-31" }],
  ["ContaSol (CSV)", () => [{ name: "csv", rows: parseCsv(contasolCsv) }], "contasol", { start: "2025-01-01", end: "2025-12-31" }],
  ["Holded export", () => sheet(holdedRows), "generic", null],
  ["Odoo", () => sheet(odooRows), "odoo", { start: "2025-01-01", end: "2025-12-31" }],
] as const)("%s", (_label, sheets, template, period) => {
  const r = parse(sheets());
  const tb = r.data!;
  it("detects template and printed period", () => {
    expect(tb.template).toBe(template);
    expect(tb.period).toEqual(period);
  });
  it("keeps only leaf accounts, balanced, with provenance", () => {
    expect(tb.balances).toHaveLength(tbSmallSl.length);
    expect(tb.totals.debit).toBeCloseTo(tb.totals.credit, 2);
    expect(r.warnings.map((w) => w.code)).not.toContain("tb_unbalanced");
    for (const b of tb.balances) expect(b.sourceRef).toMatch(/^doc:d1:sheet:[^:]+:row:\d+$/);
  });
  it("produces the same statement as the hand-checked balances", () => {
    const s = buildStatement(tb.balances, FY).data;
    expect(s.balanceSheet.assets.total).toBeCloseTo(expected.balanceSheet.assets.total, 2);
    expect(s.balanceSheet.equityAndLiabilities.equity).toBeCloseTo(expected.balanceSheet.equityAndLiabilities.equity, 2);
    expect(s.incomeStatement.ebitda).toBeCloseTo(expected.incomeStatement.ebitda, 2);
    expect(s.derived.financialDebt).toBeCloseTo(expected.derived.financialDebt, 2);
  });
});

describe("robustness", () => {
  it("drops group rows and reports how many", () => {
    expect(parse(sheet(a3Rows)).data!.groupRowsDropped).toBeGreaterThan(10);
  });
  it("uses debe − haber (+ opening) when there are no balance columns", () => {
    const rows = [["Cuenta", "Descripción", "Saldo anterior", "Debe", "Haber"], ["57200001", "Banco", 1000, 500, 200], ["10000000", "Capital", -1000, 0, 300]];
    const tb = parse(sheet(rows)).data!;
    expect(tb.balances.map((b) => [b.account, b.debit, b.credit])).toEqual([["57200001", 1300, 0], ["10000000", 0, 1300]]);
  });
  it("warns when the TB does not balance and when P&L accounts are missing", () => {
    const rows = [["Cuenta", "Saldo"], ["57200001", 1000], ["10000000", -900]];
    const codes = parse(sheet(rows)).warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["tb_unbalanced", "tb_no_pnl_accounts"]));
  });
  it("reports a missing header instead of throwing, and accepts an explicit mapping", () => {
    const rows = [["x", "y", "z"], ["57200001", "Banco", 100], ["70000000", "Ventas", -100]];
    const miss = parseTrialBalance(sheet(rows), { docId: "d", fileName: "f.csv" });
    expect(miss.data).toBeNull();
    expect(miss.warnings[0].code).toBe("tb_header_not_found");
    const ok = parseTrialBalance(sheet(rows), { docId: "d", fileName: "f.csv", mapping: { sheet: "Hoja1", headerRow: 0, account: 0, name: 1, balance: 2 } });
    expect(ok.data!.balances).toHaveLength(2);
  });
  it("ignores a print date next to a range, and gives up on ambiguous dates", () => {
    expect(detectPeriod(sheet([["Impreso 29/09/2026"], ["Del 01/01/2025 al 31/12/2025"]]))).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(detectPeriod(sheet([["01/01/2025"], ["30/06/2025"], ["29/09/2026"]]))).toBeNull();
  });
  it("finds the table on the first sheet that has one", () => {
    expect(detectMapping([{ name: "Portada", rows: [["Informe"]] }, { name: "Datos", rows: holdedRows }])?.sheet).toBe("Datos");
  });
});

describe("spreadsheet reading", () => {
  it("decodes Windows-1252 CSV and detects ';'", () => {
    const bytes = new Uint8Array([...Buffer.from("C", "latin1"), 0xf3, ...Buffer.from("digo;Descripci", "latin1"), 0xf3, ...Buffer.from("n\r\n1;Cami", "latin1"), 0xf3, 0x6e]);
    expect(parseCsv(decodeText(bytes))).toEqual([["Código", "Descripción"], ["1", "Camión"]]);
  });
  it("handles quoted fields with delimiters and quotes", () => {
    expect(parseCsv('a;"b;c";"d ""e"""\n1;2;3')).toEqual([["a", "b;c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("reads a real .xlsx (formulas use their cached result) and parses it end to end", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sumas y saldos");
    sageRows.forEach((r) => ws.addRow(r));
    ws.getCell("C1").value = { formula: "1+1", result: 2 };
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const sheets = await readSpreadsheet(bytes, "xlsx");
    expect(sheets[0].name).toBe("Sumas y saldos");
    expect(sheets[0].rows[0][2]).toBe(2);
    const tb = parseTrialBalance(sheets, { docId: "d1", fileName: "sage.xlsx" }).data!;
    expect(buildStatement(tb.balances, FY).data.incomeStatement.ebitda).toBeCloseTo(expected.incomeStatement.ebitda, 2);
  });
});
