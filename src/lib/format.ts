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
