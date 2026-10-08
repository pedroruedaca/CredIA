/** Display formatting (es-ES). Round only here, never in the engine. */
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateShort = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });

export const formatEur = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : eur.format(Number(n));

export const formatDate = (iso: string | null | undefined) => (iso ? dateShort.format(new Date(iso)) : "—");

/** A calendar date (YYYY-MM-DD), read at midday so no time zone moves it to another day. */
export const formatDay = (date: string | null | undefined) => (date ? formatDate(`${date.slice(0, 10)}T12:00:00Z`) : "—");

/** Short, stable case reference for display, e.g. "CASO-3F2A91C0". */
export const caseRef = (id: string) => `CASO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const monthYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

/** "marzo de 2026". */
export const formatMonthYear = (iso: string) => monthYear.format(new Date(iso));

/** Today's calendar date in Spain, YYYY-MM-DD (the borrower's and lender's "today"). */
export const todayMadrid = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export type FigureUnit = "EUR" | "x" | "%" | "days" | "count";

const UNIT_LABEL: Record<FigureUnit, string> = { EUR: "€", x: "x", "%": "%", days: "días", count: "" };

/**
 * Spanish formatting for a figure, split into number and unit so the UI can style them apart.
 * EUR ≥ 1M is shown in millions ("1,25 M€"), otherwise whole euros with grouping ("412.345 €").
 * Ratios/percentages keep `decimals` (default 1 for x, 0 for % and days; counts whole, or 1 decimal for averages). null → "—" with no unit.
 */
export function formatFigure(value: number | null | undefined, unit: FigureUnit, decimals?: number): { number: string; unit: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { number: "—", unit: "" };
  const fmt = (n: number, d: number) =>
    n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  if (unit === "EUR") {
    if (Math.abs(value) >= 1_000_000) return { number: fmt(value / 1_000_000, decimals ?? 2), unit: "M€" };
    return { number: fmt(value, decimals ?? 0), unit: "€" };
  }
  return { number: fmt(value, decimals ?? (unit === "x" ? 1 : unit === "count" && !Number.isInteger(value) ? 1 : 0)), unit: UNIT_LABEL[unit] };
}

/** "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días", then the short date. */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  const day = (d: Date) => todayMadrid(d);
  const days = Math.round((Date.parse(day(now)) - Date.parse(day(then))) / 86_400_000);
  if (days === 0) return `hace ${hours} h`;
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatDate(iso);
}

/** Whole euros with grouping, no unit ("1.000.000", "−9.000"), for tables. */
export function formatEurWhole(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(Math.round(n)).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  return n < -0.5 ? `−${s}` : s;
}

/** Compact euros for prose: "1,0 M€", "110 k€", "950 €"; negatives with a true minus sign. */
export function formatCompactEur(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const fmt = (v: number, d: number) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
  if (a >= 999_500) return `${sign}${fmt(a / 1_000_000, 1)} M€`;
  if (a >= 1000) return `${sign}${fmt(Math.round(a / 1000), 0)} k€`;
  return `${sign}${fmt(Math.round(a), 0)} €`;
}

/** "de" + a noun phrase, contracting "de el" to "del": de("el Modelo 200") → "del Modelo 200". */
export const de = (phrase: string) => (phrase.startsWith("el ") ? `del ${phrase.slice(3)}` : `de ${phrase}`);
