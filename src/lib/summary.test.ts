import { describe, expect, it } from "vitest";
import { tbSmallSl } from "./__fixtures__/tb-small-sl.ts";
import { formatCompactEur } from "./format.ts";
import { buildStatement } from "./pgc/mapping.ts";
import type { CirbeExtraction } from "./schema/canonical.ts";
import { caseSummary, summaryText } from "./summary.ts";

// Fixture: revenue 1.000.000, EBITDA 110.000, financial debt 160.000 (100 LP + 40 CP + 20 overdrawn bank).
const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
const ytd = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-08-31" }).data;
const cirbe = (drawn: number[], asOf = "2025-12-31"): CirbeExtraction => ({
  nif: "B12345674", asOf,
  positions: drawn.map((d, i) => ({ entity: `Banco ${i}`, product: "préstamo", drawn: d, limit: null, overdue: 0, maturity: null, page: 1 })),
});

describe("formatCompactEur", () => {
  it("uses M€, k€ and €", () => {
    expect(formatCompactEur(1_000_000)).toBe("1,0 M€");
    expect(formatCompactEur(1_250_000)).toBe("1,3 M€");
    expect(formatCompactEur(110_000)).toBe("110 k€");
    expect(formatCompactEur(85_400)).toBe("85 k€");
    expect(formatCompactEur(950)).toBe("950 €");
    expect(formatCompactEur(-30_000)).toBe("−30 k€");
  });
});

describe("caseSummary", () => {
  it("states revenue, EBITDA and margin for the closed year, and the CIRBE gap", () => {
    const s = caseSummary({ closed, ytd: null, cirbe: cirbe([140_000, 20_000, 60_000, 25_000]) });
    expect(summaryText(s)).toBe("Facturó 1,0 M€ en 2025 con un EBITDA de 110 k€ (11 %). Su deuda bancaria según CIRBE es de 245 k€, 85 k€ más que en contabilidad.");
    expect(s!.filter((x) => x.emphasis === "figure").map((x) => x.text)).toEqual(["1,0 M€", "110 k€", "245 k€"]);
    expect(s!.find((x) => x.emphasis === "discrepancy")?.text).toBe("85 k€ más");
  });
  it("says 'en línea' within tolerance and 'menos' when CIRBE is lower", () => {
    expect(summaryText(caseSummary({ closed, ytd: null, cirbe: cirbe([158_000]) }))).toMatch(/158 k€, en línea con la contabilidad\.$/);
    expect(summaryText(caseSummary({ closed, ytd: null, cirbe: cirbe([100_000]) }))).toMatch(/60 k€ menos que en contabilidad\.$/);
  });
  it("omits the CIRBE clause without CIRBE", () => {
    expect(summaryText(caseSummary({ closed, ytd: null, cirbe: null }))).toBe("Facturó 1,0 M€ en 2025 con un EBITDA de 110 k€ (11 %).");
  });
  it("falls back to the current year, not annualised", () => {
    expect(summaryText(caseSummary({ closed: null, ytd, cirbe: null }))).toBe("Facturó 1,0 M€ en 2026 hasta agosto con un EBITDA de 110 k€ (11 %).");
  });
  it("is null with nothing to say", () => {
    expect(caseSummary({ closed: null, ytd: null, cirbe: null })).toBeNull();
  });
  it("contains no evaluative words", () => {
    const text = summaryText(caseSummary({ closed, ytd, cirbe: cirbe([400_000]) }));
    for (const w of ["sólid", "buen", "mal", "riesg", "preocup", "saneada", "débil", "fuerte", "recomend", "aprob"]) expect(text.toLowerCase()).not.toContain(w);
  });
  it("states only the chosen figures, in a fixed order", () => {
    const sum = (facts: Parameters<typeof caseSummary>[0]["facts"], y = ytd) => summaryText(caseSummary({ closed, ytd: y, cirbe: cirbe([158_000]), facts }));
    expect(sum(["revenue"])).toBe("Facturó 1,0 M€ en 2025.");
    expect(sum(["ebitda"])).toBe("En 2025 tuvo un EBITDA de 110 k€ (11 % de las ventas).");
    expect(sum(["cirbe"])).toBe("Su deuda bancaria según CIRBE es de 158 k€, en línea con la contabilidad.");
    const n = closed.incomeStatement.netIncome;
    expect(sum(["netIncome", "ebitda", "revenue"])).toBe(`Facturó 1,0 M€ en 2025 con un EBITDA de 110 k€ (11 %) y un resultado neto de ${formatCompactEur(n)}.`);
    const { netDebt, workingCapital } = closed.derived;
    const equity = closed.balanceSheet.equityAndLiabilities.equity;
    const netDebtText = netDebt < 0 ? `una caja neta de ${formatCompactEur(-netDebt)}` : `una deuda financiera neta de ${formatCompactEur(netDebt)}`;
    expect(sum(["workingCapital", "equity", "netDebt"])).toBe(
      `A 31 de diciembre de 2025 tenía ${netDebtText}, un patrimonio neto de ${formatCompactEur(equity)} y un fondo de maniobra de ${formatCompactEur(workingCapital)}.`,
    );
  });
  it("adds the current year's sales next to the closed year's, not twice", () => {
    const s = caseSummary({ closed, ytd, cirbe: null, facts: ["revenue", "ytdRevenue"] });
    expect(summaryText(s)).toBe("Facturó 1,0 M€ en 2025. En 2026 hasta agosto lleva facturados 1,0 M€.");
    expect(s!.filter((x) => x.emphasis === "figure")).toHaveLength(2);
    expect(summaryText(caseSummary({ closed: null, ytd, cirbe: null, facts: ["revenue", "ytdRevenue"] }))).toBe("Facturó 1,0 M€ en 2026 hasta agosto.");
    expect(summaryText(caseSummary({ closed: null, ytd, cirbe: null, facts: ["ytdRevenue"] }))).toBe("En 2026 hasta agosto lleva facturados 1,0 M€.");
  });
  it("is null when none of the chosen figures exists", () => {
    expect(caseSummary({ closed, ytd: null, cirbe: null, facts: ["cirbe", "ytdRevenue"] })).toBeNull();
  });
});
