/**
 * Borrower checklist: turns requirements + documents + Holded connections into one item per requested
 * document with a state and a borrower-facing message. Pure; the portal page and the submit route both use it,
 * so what the borrower sees is exactly what the server enforces.
 */
import { REQUIREMENT_KINDS, type RequirementKind } from "../cases/requirements.ts";
import { formatDate, formatMonthYear } from "../format.ts";

export type ItemState = "pending" | "in_progress" | "done" | "attention";

export interface ChecklistRequirement {
  doc_kind: string;
  required: boolean;
  max_age_days: number | null;
}

export interface ChecklistDocument {
  id: string;
  kind: string;
  status: string; // uploaded | parsing | parsed | needs_review | failed
  original_filename: string | null;
  issued_on: string | null; // YYYY-MM-DD
  attention_message: string | null;
  uploaded_at: string;
  /** What processing read, when it has run: the period a trial balance or bank file covers. */
  summary?: { period?: { start: string; end: string } | null } | null;
}

export interface ChecklistHoldedPeriod {
  kind: "closed_fy" | "ytd";
  start: string;
  end: string;
}

export interface ChecklistHolded {
  id: string;
  status: string; // pending | syncing | synced | invalid_key | missing_scope | error | revoked
  mode: string; // one_time | refresh
  revoked_at: string | null;
  created_at: string;
  periods: ChecklistHoldedPeriod[];
}

export interface ChecklistFile {
  id: string;
  name: string;
  label: string; // "recibido", "leído correctamente", ...
  tone: "ok" | "neutral" | "problem";
  /** Detected period, e.g. "oct 25 – sep 26". */
  period: string | null;
}

export interface ChecklistItem {
  kind: RequirementKind;
  required: boolean;
  maxAgeDays: number | null;
  state: ItemState;
  /** One line under the title for collapsed rows: what was received. */
  summary: string | null;
  /** What to do to fix it, when state is "attention". */
  fix: string | null;
  files: ChecklistFile[];
  /** The Holded connection behind the accounting item, if any. */
  holded: ChecklistHolded | null;
}

export interface Checklist {
  items: ChecklistItem[];
  done: number;
  total: number;
  allRequiredDone: boolean;
  missing: RequirementKind[];
  /** The item to show expanded when the page opens. */
  firstIncomplete: RequirementKind | null;
}

export interface ChecklistInput {
  lenderName: string;
  requirements: ChecklistRequirement[];
  documents: ChecklistDocument[];
  holded: ChecklistHolded[];
  today: string; // YYYY-MM-DD, Europe/Madrid
  now?: Date;
}

const PROVIDED = new Set(["uploaded", "parsing", "parsed"]);
const PROBLEM = new Set(["failed", "needs_review"]);

/** A sync still "syncing" after this long died with its request. */
const STALE_SYNC_MS = 10 * 60 * 1000;

const DOC_NOUN: Partial<Record<RequirementKind, string>> = {
  aeat_cert: "El certificado",
  tgss_cert: "El certificado",
  cirbe: "El informe",
  solvency_report: "El informe",
};

// Fixed list: ICU versions disagree on Spanish abbreviations ("sep" vs "sept").
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2025-10-01".."2026-09-30" → "oct 25 – sep 26". */
export function periodLabel(start: string, end: string): string {
  const f = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
  return `${f(start)} – ${f(end)}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** "de los últimos 3 meses", "del último mes", "de los últimos 45 días". */
export function freshnessWindow(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "del último mes" : `de los últimos ${months} meses`;
  }
  return days === 1 ? "del último día" : `de los últimos ${days} días`;
}

export function isStale(issuedOn: string | null, maxAgeDays: number | null, today: string): boolean {
  if (!maxAgeDays || !issuedOn) return false;
  return daysBetween(issuedOn, today) > maxAgeDays;
}

function fileLabel(d: ChecklistDocument, stale: boolean): Pick<ChecklistFile, "label" | "tone"> {
  if (stale) return { label: "demasiado antiguo", tone: "problem" };
  switch (d.status) {
    case "parsed":
      return { label: "leído correctamente", tone: "ok" };
    case "parsing":
      return { label: "leyendo…", tone: "neutral" };
    case "uploaded":
      return { label: "recibido", tone: "ok" };
    default:
      return { label: "no se ha podido leer", tone: "problem" };
  }
}

function holdedPeriodsText(periods: ChecklistHoldedPeriod[], today: string): string {
  const closed = periods.find((p) => p.kind === "closed_fy");
  const ytd = periods.find((p) => p.kind === "ytd");
  const parts: string[] = [];
  if (closed) parts.push(`ejercicio ${closed.end.slice(0, 4)}`);
  if (ytd) parts.push(ytd.end === today ? `${ytd.end.slice(0, 4)} hasta hoy` : `${ytd.end.slice(0, 4)} hasta el ${formatDate(ytd.end)}`);
  if (parts.length === 0) return "Conectado con Holded";
  return `Conectado con Holded · ${parts.join(" y ")} importado${parts.length > 1 ? "s" : ""}`;
}

const HOLDED_FIX: Record<string, string> = {
  invalid_key: "La clave de Holded no es válida o se ha eliminado. Crea una nueva y vuelve a conectar, o sube el sumas y saldos.",
  missing_scope: "A la clave de Holded le faltan permisos de lectura de contabilidad. Crea una nueva con los permisos indicados, o sube el sumas y saldos.",
  error: "No pudimos importar los datos de Holded. Inténtalo de nuevo o sube el sumas y saldos.",
};

function holdedEffectiveStatus(h: ChecklistHolded, now: Date): string {
  if (h.status === "syncing" && now.getTime() - new Date(h.created_at).getTime() > STALE_SYNC_MS) return "error";
  return h.status;
}

function buildItem(req: ChecklistRequirement & { doc_kind: RequirementKind }, input: ChecklistInput, now: Date): ChecklistItem {
  const kind = req.doc_kind;
  const maxAge = req.max_age_days;
  const docs = input.documents
    .filter((d) => d.kind === kind)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

  const files: ChecklistFile[] = docs.map((d) => ({
    id: d.id,
    name: d.original_filename ?? "documento",
    period: d.summary?.period ? periodLabel(d.summary.period.start, d.summary.period.end) : null,
    ...fileLabel(d, PROVIDED.has(d.status) && isStale(d.issued_on, maxAge, input.today)),
  }));

  const usable = docs.filter((d) => PROVIDED.has(d.status) && !isStale(d.issued_on, maxAge, input.today));
  const ready = usable.filter((d) => d.status !== "parsing");

  // Accounting can also come from Holded. The most recent connection decides.
  const holdedList = kind === "trial_balance" ? [...input.holded].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const syncedHolded = holdedList.find((h) => h.status === "synced") ?? null;
  const latestHolded = holdedList[0] ?? null;
  const latestHoldedStatus = latestHolded ? holdedEffectiveStatus(latestHolded, now) : null;

  const base = { kind, required: req.required, maxAgeDays: maxAge, files, holded: syncedHolded ?? latestHolded };

  if (syncedHolded || ready.length > 0) {
    return { ...base, state: "done", summary: doneSummary(kind, ready, syncedHolded, maxAge, input.today), fix: null };
  }
  if (usable.length > 0 || latestHoldedStatus === "syncing" || latestHoldedStatus === "pending") {
    const summary = latestHoldedStatus === "syncing" ? "Importando datos de Holded…" : "Leyendo el documento…";
    return { ...base, state: "in_progress", summary, fix: null };
  }

  // Nothing usable: explain the most recent problem, if there was one.
  const lastDoc = docs[0];
  const lastHoldedFailed = latestHoldedStatus && HOLDED_FIX[latestHoldedStatus] ? latestHolded : null;
  const holdedIsNewer = lastHoldedFailed && (!lastDoc || lastHoldedFailed.created_at > lastDoc.uploaded_at);
  if (holdedIsNewer) {
    return { ...base, state: "attention", summary: null, fix: HOLDED_FIX[latestHoldedStatus!] };
  }
  if (lastDoc) {
    const name = lastDoc.original_filename ?? "el documento";
    let fix: string;
    if (PROVIDED.has(lastDoc.status) && isStale(lastDoc.issued_on, maxAge, input.today)) {
      const noun = DOC_NOUN[kind] ?? "El documento";
      fix = `${noun} subido es de ${formatMonthYear(lastDoc.issued_on!)}. ${input.lenderName} necesita uno ${freshnessWindow(maxAge!)}.`;
    } else if (PROBLEM.has(lastDoc.status)) {
      fix = lastDoc.attention_message ?? `No hemos podido leer «${name}». Comprueba que es el documento correcto y vuelve a subirlo.`;
    } else {
      fix = `Vuelve a subir «${name}».`;
    }
    return { ...base, state: "attention", summary: null, fix };
  }
  return { ...base, state: "pending", summary: null, fix: null };
}

function doneSummary(
  kind: RequirementKind,
  ready: ChecklistDocument[],
  holded: ChecklistHolded | null,
  maxAge: number | null,
  today: string,
): string {
  if (holded) return holdedPeriodsText(holded.periods, today);
  if (ready.length > 1) return `${ready.length} ficheros recibidos`;
  const d = ready[0];
  if (d.issued_on) return `Emitido el ${formatDate(d.issued_on)}${maxAge ? " · vigente" : ""}`;
  return `${d.original_filename ?? "Documento"} · ${fileLabel(d, false).label}`;
}

export function buildChecklist(input: ChecklistInput): Checklist {
  const now = input.now ?? new Date();
  const order = (k: string) => REQUIREMENT_KINDS.indexOf(k as RequirementKind);
  const reqs = input.requirements
    .filter((r): r is ChecklistRequirement & { doc_kind: RequirementKind } => order(r.doc_kind) >= 0)
    .sort((a, b) => order(a.doc_kind) - order(b.doc_kind));

  const items = reqs.map((r) => buildItem(r, input, now));
  const required = items.filter((i) => i.required);
  const missing = required.filter((i) => i.state !== "done").map((i) => i.kind);
  return {
    items,
    done: required.length - missing.length,
    total: required.length,
    allRequiredDone: missing.length === 0,
    missing,
    firstIncomplete: items.find((i) => i.state !== "done")?.kind ?? null,
  };
}
