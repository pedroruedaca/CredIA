/**
 * How much a company link may send. Pure.
 *
 * - A case holds at most MAX_DOCUMENTS_PER_CASE documents and MAX_CASE_BYTES of files (company and analyst uploads
 *   together). Each document is read by Claude at most once (the pipeline skips documents already extracted), so this
 *   also caps a case's Claude spend.
 * - Per link holder (the company's link, or each gestoría link), counted in the database (`hit_rate_limit`, 0027):
 *   upload URLs, Holded connections and gestoría invitations per window. The assistant has its own limit.
 */
import type { BorrowerAccess } from "./access.ts";

export const MAX_DOCUMENTS_PER_CASE = 200;
export const MAX_CASE_BYTES = 250 * 1024 * 1024;

export const RATE_LIMITS = {
  /** Signed upload URLs (POST /uploads) per link holder. Each document needs one; a busy company uploads a few dozen. */
  upload: { max: 40, windowSeconds: 60 * 60 },
  /**
   * Signed upload URLs per case and day, all link holders together. A URL lets the browser put up to 20 MB in Storage
   * whether or not the document is then registered; unregistered files are swept daily (`sweepOrphanUploads`).
   */
  uploadCase: { max: MAX_DOCUMENTS_PER_CASE, windowSeconds: 24 * 60 * 60 },
  /** Holded connections: each one calls Holded and runs a sync. */
  holded: { max: 10, windowSeconds: 60 * 60 },
  /** Gestoría invitations (emails sent to an address the company types). */
  delegate: { max: 10, windowSeconds: 24 * 60 * 60 },
} as const;

export type RateLimitedRoute = keyof typeof RATE_LIMITS;

/** Per link holder, except `uploadCase`, which counts the whole case. */
export const rateKey = (route: RateLimitedRoute, access: Pick<BorrowerAccess, "caseId" | "delegateId">) =>
  route === "uploadCase" ? `${route}:${access.caseId}` : `${route}:${access.caseId}:${access.delegateId ?? "company"}`;

export const RATE_LIMITED_MESSAGE: Record<RateLimitedRoute, string> = {
  upload: "Has subido muchos ficheros en poco tiempo. Espera unos minutos y vuelve a intentarlo.",
  uploadCase: "Hoy ya se han subido muchos ficheros a esta solicitud. Vuelve a intentarlo mañana o contacta con la entidad.",
  holded: "Has intentado conectar Holded muchas veces en poco tiempo. Espera un rato y vuelve a intentarlo.",
  delegate: "Has enviado muchas invitaciones hoy. Vuelve a intentarlo mañana o contacta con la entidad.",
};

export type CapacityCheck = { ok: true } | { ok: false; message: string };

/** Whether one more file of `size` bytes fits in a case that already holds `existing` documents. */
export function caseHasRoom(existing: { count: number; bytes: number }, size: number): CapacityCheck {
  if (existing.count >= MAX_DOCUMENTS_PER_CASE) {
    return { ok: false, message: `Esta solicitud ya tiene ${MAX_DOCUMENTS_PER_CASE} documentos, el máximo. Si necesitas aportar más, contacta con la entidad.` };
  }
  if (existing.bytes + size > MAX_CASE_BYTES) {
    return { ok: false, message: "Los documentos de esta solicitud ya ocupan el máximo permitido. Si necesitas aportar más, contacta con la entidad." };
  }
  return { ok: true };
}
