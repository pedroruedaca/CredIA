import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CLOSING, csvDebitCredit, csvNewestFirst, HOLDER, MOVEMENTS, OPENING, xlsxRows } from "../__fixtures__/bank-statements.ts";
import { classifyAccounts } from "../bank/classify.ts";
import { parseBankSheets } from "./bank-sheet.ts";
import { readSpreadsheet } from "./spreadsheet.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const parseCsvFile = async (text: string) => parseBankSheets(await readSpreadsheet(enc(text), "csv"), { docId: "d1", fileName: "extracto.csv" });

describe("bank statements from Excel/CSV", () => {
  it("CSV newest first: account, holder, balances and every movement in date order", async () => {
    const r = await parseCsvFile(csvNewestFirst());
    expect(r.data?.needsReview).toBe(false);
    const [a] = r.data!.accounts;
    expect(a).toMatchObject({ bank: "0049", branch: "1500", accountMasked: "0049 1500 ****7891", name: HOLDER, start: "2026-01-02", end: "2026-03-31", openingBalance: OPENING, closingBalance: CLOSING, balancesKnown: true });
    expect(a.transactions.map((t) => t.amount)).toEqual(MOVEMENTS.map((m) => m.amount));
    expect(a.transactions[0]).toMatchObject({ description: "TRANSFERENCIA DE FERRETERIAS DEL SUR SA", sourceRef: "doc:d1:row:17" }); // last line of the file
    expect(r.warnings.map((w) => w.code)).toEqual(["statement_rows_skipped"]); // the «Saldo final» line
  });

  it("a misprinted line: the statement does not add up and needs review", async () => {
    const r = await parseCsvFile(csvNewestFirst({ breakLine: 3 }));
    expect(r.data?.needsReview).toBe(true);
    expect(r.warnings.find((w) => w.code === "statement_balance_mismatch")?.message).toMatch(/una línea no cuadra/);
  });

  it("Excel with date cells, «Movimiento» and «Disponible»", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Movimientos").addRows(xlsxRows());
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const r = parseBankSheets(await readSpreadsheet(bytes, "xlsx"), { docId: "d2", fileName: "movimientos.xlsx" });
    const [a] = r.data!.accounts;
    expect(r.data!.needsReview).toBe(false);
    expect(a).toMatchObject({ accountMasked: "0049 1500 ****7891", openingBalance: OPENING, closingBalance: CLOSING, name: HOLDER });
    expect(a.transactions[0].description).toBe("TRANSFERENCIA DE FERRETERIAS DEL SUR SA · Abono");
    expect(a.transactions[0].sourceRef).toBe("doc:d2:sheet:Movimientos:row:16");
  });

  it("«Cargo» / «Abono» without balances: flows only, said so", async () => {
    const r = await parseCsvFile(csvDebitCredit());
    const [a] = r.data!.accounts;
    expect(a.balancesKnown).toBe(false);
    expect(a.accountMasked).toBe("extracto.csv"); // no IBAN: named by the file
    expect(a.totals).toMatchObject({ debitCount: 8, creditCount: 3 });
    expect(r.data!.needsReview).toBe(false);
    expect(r.warnings.map((w) => w.code)).toEqual(["statement_no_iban", "statement_no_balances"]);
  });

  it("the movements classify like Norma 43 ones", async () => {
    const r = await parseCsvFile(csvNewestFirst());
    classifyAccounts(r.data!.accounts, { companyName: "Comercial Distribuciones Levante, S.L." });
    const cats = Object.fromEntries(r.data!.accounts[0].transactions.map((t) => [t.description, t.category]));
    expect(cats).toMatchObject({
      "TRANSFERENCIA DE FERRETERIAS DEL SUR SA": "customer_receipt",
      "NOMINAS ENERO 2026": "payroll",
      "TGSS COTIZACION 012026": "social_security",
      "CUOTA PRESTAMO 9900112": "debt_service",
      "AEAT MODELO 303 4T 2025": "tax",
      "COMISION MANTENIMIENTO": "bank_fees",
    });
  });

  it("a person's account (DNI next to «Titular») is rejected; the company's CIF is fine", async () => {
    const personal = csvNewestFirst().replace(`Titular;${HOLDER}`, "Titular;JUAN GARCIA LOPEZ;NIF 12345678Z");
    expect((await parseCsvFile(personal)).data).toMatchObject({ accounts: [], rejected: expect.stringMatching(/cuenta personal/) });
    const company = csvNewestFirst().replace(`Titular;${HOLDER}`, `Titular;${HOLDER};CIF B12345674`);
    expect((await parseCsvFile(company)).data?.rejected).toBeUndefined();
  });

  it("not a statement: nothing", async () => {
    expect((await parseCsvFile("cuenta;nombre;debe;haber\n4300001;Cliente;100;0")).data).toBeNull();
  });
});
