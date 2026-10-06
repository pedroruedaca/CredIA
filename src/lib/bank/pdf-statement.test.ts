import { describe, expect, it } from "vitest";
import { CLOSING, HOLDER, IBAN, MOVEMENTS, OPENING, withBalances } from "../__fixtures__/bank-statements.ts";
import type { BankStatementWire } from "../extract/schemas.ts";
import { statementFromPdf } from "./pdf-statement.ts";

const ctx = { docId: "p1", fileName: "extracto.pdf", caseCif: "B12345674", companyName: "Comercial Distribuciones Levante, S.L." };

/** What the reader returns for a 6-page statement, read in windows 1–4 and 5–6: two movements per page, newest first. */
function windows(opts: { misread?: number; nif?: string | null; type?: BankStatementWire["document_type"]; holderId?: string } = {}) {
  const lines = withBalances()
    .reverse()
    .map((m, i) => ({ iban: IBAN, page: Math.floor(i / 2) + 1, date: m.date, value_date: "", description: m.text, amount: i === opts.misread ? m.amount - 10 : m.amount, balance: m.balance }));
  const base = { document_type: opts.type ?? ("bank_statement" as const), company_nif: opts.nif ?? null, company_name: HOLDER, legible: true };
  const account = { iban: IBAN, holder: HOLDER, holder_id: opts.holderId ?? "", bank_name: "Banco", currency: "EUR", period_start: "2026-01-01", period_end: "2026-03-31" };
  return [
    {
      window: [1, 4] as [number, number],
      wire: {
        ...base,
        accounts: [{ ...account, opening_balance: null, closing_balance: CLOSING }], // newest first: the closing balance is on page 1
        // A line from page 5 read by this window too: ignored here, taken from its own window.
        movements: [...lines.filter((l) => l.page <= 4), { ...lines.find((l) => l.page === 5)! }],
      },
    },
    { window: [5, 6] as [number, number], wire: { ...base, accounts: [{ ...account, opening_balance: OPENING, closing_balance: null }], movements: lines.filter((l) => l.page >= 5) } },
  ];
}

describe("bank statements from PDF", () => {
  it("merges the windows and checks that it adds up", () => {
    const r = statementFromPdf(windows(), ctx);
    expect(r.status).toBe("parsed");
    const [a] = r.accounts;
    expect(a).toMatchObject({ accountMasked: "0049 1500 ****7891", name: HOLDER, start: "2026-01-01", end: "2026-03-31", openingBalance: OPENING, closingBalance: CLOSING, balancesKnown: true });
    expect(a.transactions.map((t) => t.amount)).toEqual(MOVEMENTS.map((m) => m.amount)); // each once, in date order
    expect(a.transactions[0].sourceRef).toBe("doc:p1:page:6");
  });

  it("a misread amount: not used, sent to review", () => {
    const r = statementFromPdf(windows({ misread: 4 }), ctx);
    expect(r.status).toBe("needs_review");
    expect(r.attention).toMatch(/no cuadran con sus saldos/);
    expect(r.warnings.map((w) => w.code)).toContain("statement_balance_mismatch");
  });

  it("another company's statement, or not a statement", () => {
    expect(statementFromPdf(windows({ nif: "B87654323" }), ctx)).toMatchObject({ status: "failed", attention: expect.stringMatching(/es de otra empresa/) });
    expect(statementFromPdf(windows({ type: "invoice" }), ctx)).toMatchObject({ status: "failed", attention: expect.stringMatching(/no parece un extracto/) });
  });

  it("a person's account (DNI or NIE as the holder's ID) is not accepted", () => {
    expect(statementFromPdf(windows({ holderId: "12345678Z" }), ctx)).toMatchObject({ status: "failed", attention: expect.stringMatching(/es de una cuenta personal/) });
    expect(statementFromPdf(windows({ nif: "X1234567L" }), ctx).status).toBe("failed");
    expect(statementFromPdf(windows({ holderId: "B12345674" }), ctx).status).toBe("parsed"); // the company's own CIF
  });

  it("no movements: says so", () => {
    const w = windows();
    w.forEach((x) => (x.wire.movements = []));
    expect(statementFromPdf(w, ctx)).toMatchObject({ status: "failed", attention: expect.stringMatching(/No hemos encontrado movimientos/) });
  });
});
