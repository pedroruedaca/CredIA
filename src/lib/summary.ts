/**
 * One-sentence case summary for the lender view and the PDF. Deterministic template over the statements and
 * CIRBE: facts only, no adjectives, no judgement. Returns segments so the UI can emphasise figures and
 * discrepancies. The CIRBE clause is omitted when there is no CIRBE report.
 */
import { cirbeDrawnDebt, withinDebtTolerance } from "./checks/engine.ts";
import { formatCompactEur } from "./format.ts";
import { isFullStatement, type CanonicalStatement } from "./pgc/mapping.ts";
import type { CirbeExtraction } from "./schema/canonical.ts";
import { DEFAULT_SUMMARY_FACTS, type SummaryFactId } from "./case-view/modules.ts";

export type SummarySegment = { text: string; emphasis?: "figure" | "discrepancy" };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodPhrase(s: CanonicalStatement): string {
  const [sy, ey] = [s.period.start.slice(0, 4), s.period.end.slice(0, 4)];
  if (s.period.kind === "ytd") return `en ${ey} hasta ${MONTHS[Number(s.period.end.slice(5, 7)) - 1]}`;
  return sy === ey ? `en ${ey}` : `en el ejercicio ${sy}-${ey.slice(2)}`;
}

const pct = (n: number) => `${Math.round(n * 100).toLocaleString("es-ES")} %`;

function datePhrase(iso: string): string {
  return `a ${Number(iso.slice(8, 10))} de ${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
}

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A clause is a list of pieces: plain text, or a figure. */
type Piece = string | { figure: string };
const F = (figure: string): Piece => ({ figure });

/** "a", "a y b", "a, b y c". */
const listPhrase = (parts: Piece[][]): Piece[] => parts.flatMap((p, i) => (i === 0 ? p : [i === parts.length - 1 ? " y " : ", ", ...p]));

export function caseSummary(input: {
  closed: CanonicalStatement | null;
  ytd: CanonicalStatement | null;
  cirbe: CirbeExtraction | null;
  /** Where each statement comes from: upload | holded | annual_accounts | modelo200 | modelo303. */
  closedSource?: string | null;
  ytdSource?: string | null;
  /** Which figures to state (order does not matter: the sentence order is fixed). Default revenue, EBITDA, CIRBE. */
  facts?: readonly SummaryFactId[];
}): SummarySegment[] | null {
  const facts = new Set(input.facts ?? DEFAULT_SUMMARY_FACTS);
  const out: SummarySegment[] = [];
  const t = (text: string) => out.push({ text });
  const fig = (text: string) => out.push({ text, emphasis: "figure" });
  const emit = (pieces: Piece[]) => pieces.forEach((p) => (typeof p === "string" ? t(p) : fig(p.figure)));
  const sep = () => (out.length ? " " : "");

  // Revenue and EBITDA from the closed year when it has a P&L, otherwise the current year (actual, not annualised).
  const s = input.closed?.pnlAvailable ? input.closed : input.ytd?.pnlAvailable ? input.ytd : null;
  let revenueStated: CanonicalStatement | null = null;
  if (s) {
    const { revenue, ebitda, netIncome } = s.incomeStatement;
    const tail: Piece[][] = [];
    if (facts.has("ebitda")) tail.push(["un EBITDA de ", F(formatCompactEur(ebitda)), ...(revenue > 0 ? [` (${pct(ebitda / revenue)}${facts.has("revenue") ? "" : " de las ventas"})`] : [])]);
    if (facts.has("netIncome")) tail.push(["un resultado neto de ", F(formatCompactEur(netIncome))]);
    if (facts.has("revenue")) {
      revenueStated = s;
      emit(["Facturó ", F(formatCompactEur(revenue)), ` ${periodPhrase(s)}`, ...(tail.length ? [" con ", ...listPhrase(tail)] : []), "."]);
    } else if (tail.length) emit([`${capitalise(periodPhrase(s))} tuvo `, ...listPhrase(tail), "."]);
  } else if (facts.has("revenue")) {
    // Only sales declared in the Modelo 303 (no P&L): revenue, said as what it is.
    const r = input.closed?.scope === "revenue" ? input.closed : input.ytd?.scope === "revenue" ? input.ytd : null;
    if (r) {
      revenueStated = r;
      t("Declaró ventas por ");
      fig(formatCompactEur(r.incomeStatement.revenue));
      t(` ${periodPhrase(r)} en sus Modelos 303 de IVA.`);
    }
  }

  // The current year's sales next to the closed year's (not when the first sentence already gave them).
  if (facts.has("ytdRevenue") && input.ytd && revenueStated !== input.ytd && (input.ytd.pnlAvailable || input.ytd.scope === "revenue")) {
    const y = input.ytd;
    emit([sep(), `${capitalise(periodPhrase(y))} ${y.pnlAvailable ? "lleva facturados" : "lleva declaradas en IVA ventas por"} `, F(formatCompactEur(y.incomeStatement.revenue)), "."]);
  }

  // Balance figures at the base period's date (closed year if there is a full one, else the current year).
  const b = isFullStatement(input.closed) ? input.closed : isFullStatement(input.ytd) ? input.ytd : null;
  if (b) {
    const parts: Piece[][] = [];
    if (facts.has("netDebt")) {
      const nd = b.derived.netDebt;
      parts.push(nd < 0 ? ["una caja neta de ", F(formatCompactEur(-nd))] : ["una deuda financiera neta de ", F(formatCompactEur(nd))]);
    }
    if (facts.has("equity")) parts.push(["un patrimonio neto de ", F(formatCompactEur(b.balanceSheet.equityAndLiabilities.equity))]);
    if (facts.has("workingCapital")) parts.push(["un fondo de maniobra de ", F(formatCompactEur(b.derived.workingCapital))]);
    if (parts.length) emit([sep(), `${capitalise(datePhrase(b.period.end))} tenía `, ...listPhrase(parts), "."]);
  }

  if (facts.has("cirbe") && input.cirbe) {
    const cirbe = cirbeDrawnDebt(input.cirbe);
    // Compare with the statement closest to the CIRBE date, as the CIRBE check does.
    const asOf = Date.parse(input.cirbe.asOf);
    const books = [input.closed, input.ytd]
      .filter(isFullStatement)
      .sort((a, b) => Math.abs(Date.parse(a.period.end) - asOf) - Math.abs(Date.parse(b.period.end) - asOf))[0];
    t(out.length ? " Su deuda bancaria según CIRBE es de " : "Su deuda bancaria según CIRBE es de ");
    fig(formatCompactEur(cirbe));
    if (!books) t(".");
    else {
      const bookDebt = books.derived.financialDebt;
      const diff = cirbe - bookDebt;
      if (withinDebtTolerance(cirbe, bookDebt)) t(", en línea con la contabilidad.");
      else {
        t(", ");
        out.push({ text: `${formatCompactEur(Math.abs(diff))} ${diff > 0 ? "más" : "menos"}`, emphasis: "discrepancy" });
        t(" que en contabilidad.");
      }
    }
  }
  // Without ledger data the closed year is rebuilt from the deposited model: coarser, and the lender should know.
  const basis = (what: string) => t(`${out.length ? " " : ""}${what}`);
  if (input.closed && input.closedSource === "annual_accounts") basis("El ejercicio cerrado se ha construido con las cuentas anuales, sin sumas y saldos.");
  if (input.closed && input.closedSource === "modelo200") basis("El ejercicio cerrado se ha construido con el Modelo 200, sin sumas y saldos ni cuentas anuales.");
  if (input.closed && input.closedSource === "modelo303") basis("Del ejercicio cerrado solo hay las ventas declaradas en IVA (Modelo 303).");
  if (input.ytd && input.ytdSource === "modelo303") basis("Del año en curso solo hay las ventas declaradas en IVA (Modelo 303).");
  return out.length ? out : null;
}

export const summaryText = (segments: SummarySegment[] | null) => (segments ?? []).map((s) => s.text).join("");
