/**
 * One-sentence case summary for the lender view and the PDF. Deterministic template over the statements and
 * CIRBE: facts only, no adjectives, no judgement. Returns segments so the UI can emphasise figures and
 * discrepancies. The CIRBE clause is omitted when there is no CIRBE report.
 */
import { cirbeDrawnDebt, withinDebtTolerance } from "./checks/engine.ts";
import { formatCompactEur } from "./format.ts";
import { isFullStatement, type CanonicalStatement } from "./pgc/mapping.ts";
import type { CirbeExtraction } from "./schema/canonical.ts";

export type SummarySegment = { text: string; emphasis?: "figure" | "discrepancy" };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodPhrase(s: CanonicalStatement): string {
  const [sy, ey] = [s.period.start.slice(0, 4), s.period.end.slice(0, 4)];
  if (s.period.kind === "ytd") return `en ${ey} hasta ${MONTHS[Number(s.period.end.slice(5, 7)) - 1]}`;
  return sy === ey ? `en ${ey}` : `en el ejercicio ${sy}-${ey.slice(2)}`;
}

const pct = (n: number) => `${Math.round(n * 100).toLocaleString("es-ES")} %`;

export function caseSummary(input: {
  closed: CanonicalStatement | null;
  ytd: CanonicalStatement | null;
  cirbe: CirbeExtraction | null;
  /** Where each statement comes from: upload | holded | annual_accounts | modelo200 | modelo303. */
  closedSource?: string | null;
  ytdSource?: string | null;
}): SummarySegment[] | null {
  const out: SummarySegment[] = [];
  const t = (text: string) => out.push({ text });
  const fig = (text: string) => out.push({ text, emphasis: "figure" });

  // Revenue and EBITDA from the closed year when it has a P&L, otherwise the current year (actual, not annualised).
  const s = input.closed?.pnlAvailable ? input.closed : input.ytd?.pnlAvailable ? input.ytd : null;
  if (s) {
    const { revenue, ebitda } = s.incomeStatement;
    t("Facturó ");
    fig(formatCompactEur(revenue));
    t(` ${periodPhrase(s)} con un EBITDA de `);
    fig(formatCompactEur(ebitda));
    if (revenue > 0) t(` (${pct(ebitda / revenue)})`);
    t(".");
  } else {
    // Only sales declared in the Modelo 303 (no P&L): revenue, said as what it is.
    const r = input.closed?.scope === "revenue" ? input.closed : input.ytd?.scope === "revenue" ? input.ytd : null;
    if (r) {
      t("Declaró ventas por ");
      fig(formatCompactEur(r.incomeStatement.revenue));
      t(` ${periodPhrase(r)} en sus Modelos 303 de IVA.`);
    }
  }

  if (input.cirbe) {
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
