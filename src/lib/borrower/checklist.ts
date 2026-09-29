/**
 * Borrower checklist: one item per requested document, with a state the portal (and later the assistant) shows.
 * Pure: takes rows already loaded from the database, never touches I/O.
 */
import { REQUIREMENT_KINDS, type RequirementKind } from "../cases/requirements.ts";

export type ItemState = "pending" | "in_progress" | "done" | "attention";

export interface ChecklistRequirement {
  doc_kind: string;
  required: boolean;
  max_age_days: number | null;
}
export interface ChecklistDocument {
  id: string;
  kind: string;
  status: string;
  original_name: string | null;
  issued_on: string | null; // YYYY-MM-DD
  status_message: string | null;
  uploaded_at: string;
}
export interface ChecklistHolded {
  status: string;
  mode: string;
  last_sync_at: string | null;
  revoked_at: string | null;
}

export interface ChecklistItem {
  kind: RequirementKind;
  step: number; // 1-based position shown to the borrower
  required: boolean;
  maxAgeDays: number | null;
  state: ItemState;
  /** Borrower-facing fix message when state is "attention". */
  message: string | null;
  /** Accepted documents for this item (newest first). */
  accepted: ChecklistDocument[];
  holded: ChecklistHolded | null;
}

export interface Checklist {
  items: ChecklistItem[];
  done: number; // required items done
  total: number; // required items
  /** Kind of the item to show expanded: the first incomplete one (required first), or null when all are done. */
  expanded: RequirementKind | null;
  canSubmit: boolean;
}

/** Received and not rejected by processing (same rule as the lender list). */
const PROVIDED = new Set(["uploaded", "parsing", "parsed"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const monthYear = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

/** "de los últimos 3 meses", "del último mes", "de los últimos 45 días". */
export function freshnessWindow(maxAgeDays: number): string {
  if (maxAgeDays % 30 === 0) {
    const m = maxAgeDays / 30;
    return m === 1 ? "del último mes" : `de los últimos ${m} meses`;
  }
  return maxAgeDays === 1 ? "del último día" : `de los últimos ${maxAgeDays} días`;
}

/**
 * Checks a document's issue date against the lender's maximum age. Returns null when it is fresh enough,
 * or the borrower-facing message explaining what to do.
 */
export function freshnessProblem(issuedOn: string, maxAgeDays: number, lenderName: string, now: Date): string | null {
  const issued = new Date(`${issuedOn}T00:00:00Z`);
  if (Number.isNaN(issued.getTime())) return "No hemos podido leer la fecha de emisión. Revísala y vuelve a subirlo.";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = Math.floor((today - issued.getTime()) / DAY_MS);
  if (ageDays < 0) return "La fecha de emisión es posterior a hoy. Revísala y vuelve a subirlo.";
  if (ageDays <= maxAgeDays) return null;
  return `El certificado subido es de ${monthYear.format(issued)}. ${lenderName} necesita uno ${freshnessWindow(maxAgeDays)}.`;
}

const DEFAULT_FAILED = "No hemos podido leer este fichero. Comprueba que es el documento correcto y vuelve a subirlo.";
const DEFAULT_REVIEW = "Estamos revisando este documento. Si hace falta algo más, te lo diremos aquí.";

function itemFor(
  kind: RequirementKind,
  req: ChecklistRequirement,
  docs: ChecklistDocument[],
  holdedRows: ChecklistHolded[],
  lenderName: string,
  now: Date,
): Omit<ChecklistItem, "step"> {
  const mine = docs.filter((d) => d.kind === kind).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const accepted: ChecklistDocument[] = [];
  let problem: string | null = null;

  for (const d of mine) {
    if (PROVIDED.has(d.status)) {
      const stale = req.max_age_days && d.issued_on ? freshnessProblem(d.issued_on, req.max_age_days, lenderName, now) : null;
      if (stale) problem ??= stale; // accepted at upload but expired since
      else accepted.push(d);
    } else if (d.status === "rejected") {
      problem ??= d.status_message ?? DEFAULT_FAILED;
    } else if (d.status === "needs_review") {
      problem ??= d.status_message ?? DEFAULT_REVIEW;
    } else {
      problem ??= d.status_message ?? DEFAULT_FAILED;
    }
  }

  const holded = kind === "trial_balance" ? latestHolded(holdedRows) : null;
  const base = { kind, required: req.required, maxAgeDays: req.max_age_days, accepted, holded };

  if (accepted.length > 0 || holded?.status === "synced") return { ...base, state: "done", message: null };
  if (holded && (holded.status === "syncing" || holded.status === "pending")) return { ...base, state: "in_progress", message: null };
  if (problem) return { ...base, state: "attention", message: problem };
  if (holded && (holded.status === "invalid_key" || holded.status === "missing_scope" || holded.status === "error")) {
    return { ...base, state: "attention", message: "No se pudo importar la contabilidad de Holded. Vuelve a intentarlo o sube el sumas y saldos." };
  }
  return { ...base, state: "pending", message: null };
}

function latestHolded(rows: ChecklistHolded[]): ChecklistHolded | null {
  const synced = rows.find((r) => r.status === "synced");
  return synced ?? rows[0] ?? null;
}

/**
 * Builds the checklist in canonical document order. Only requested kinds appear; optional ones are listed but
 * don't count toward "N de M" or block submission.
 */
export function buildChecklist(
  requirements: ChecklistRequirement[],
  documents: ChecklistDocument[],
  holded: ChecklistHolded[],
  lenderName: string,
  now = new Date(),
): Checklist {
  const byKind = new Map(requirements.map((r) => [r.doc_kind, r]));
  const ordered = REQUIREMENT_KINDS.filter((k) => byKind.has(k));
  // Required items first, optional after, each group in canonical order.
  const sorted = [...ordered.filter((k) => byKind.get(k)!.required), ...ordered.filter((k) => !byKind.get(k)!.required)];

  const items = sorted.map((kind, i) => ({ step: i + 1, ...itemFor(kind, byKind.get(kind)!, documents, holded, lenderName, now) }));
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.state === "done").length;
  const firstIncomplete = items.find((i) => i.required && i.state !== "done") ?? items.find((i) => i.state !== "done");

  return {
    items,
    done,
    total: required.length,
    expanded: firstIncomplete?.kind ?? null,
    canSubmit: done === required.length,
  };
}
