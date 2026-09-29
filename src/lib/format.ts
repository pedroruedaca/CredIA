/** Display formatting (es-ES). Round only here, never in the engine. */
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateShort = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });

export const formatEur = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : eur.format(Number(n));

export const formatDate = (iso: string | null | undefined) => (iso ? dateShort.format(new Date(iso)) : "—");

/** Short, stable case reference for display, e.g. "CASO-3F2A91C0". */
export const caseRef = (id: string) => `CASO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const monthYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

/** "marzo de 2026". */
export const formatMonthYear = (iso: string) => monthYear.format(new Date(iso));

/** Today's calendar date in Spain, YYYY-MM-DD (the borrower's and lender's "today"). */
export const todayMadrid = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export type FigureUnit = "EUR" | "x" | "%" | "days";

const UNIT_LABEL: Record<FigureUnit, string> = { EUR: "€", x: "x", "%": "%", days: "días" };

/**
 * Spanish formatting for a figure, split into number and unit so the UI can style them apart.
 * EUR ≥ 1M is shown in millions ("1,25 M€"), otherwise whole euros with grouping ("412.345 €").
 * Ratios/percentages keep `decimals` (default 1 for x, 0 for % and days). null → "—" with no unit.
 */
export function formatFigure(value: number | null | undefined, unit: FigureUnit, decimals?: number): { number: string; unit: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { number: "—", unit: "" };
  const fmt = (n: number, d: number) =>
    n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  if (unit === "EUR") {
    if (Math.abs(value) >= 1_000_000) return { number: fmt(value / 1_000_000, decimals ?? 2), unit: "M€" };
    return { number: fmt(value, decimals ?? 0), unit: "€" };
  }
  return { number: fmt(value, decimals ?? (unit === "x" ? 1 : 0)), unit: UNIT_LABEL[unit] };
}
