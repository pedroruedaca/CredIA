/**
 * Outbound notifications behind an interface.
 * - RESEND_API_KEY set → emails through Resend (from CREDIA_EMAIL_FROM, optional CREDIA_EMAIL_REPLY_TO).
 * - Otherwise, in development: printed to the server console so the flow can be tested.
 * - Otherwise: nothing is sent and no link is logged.
 */
import { lenderRecipients } from "./email/recipients.ts";
import { sendWithResend } from "./email/resend.ts";
import { borrowerInviteEmail, delegateInviteEmail, documentRequestEmail, lenderNoticeEmail } from "./email/templates.ts";
import { normaliseBaseUrl } from "./base-url.ts";
import { MAGIC_LINK_TTL_DAYS } from "./magic-link.ts";

export interface BorrowerInvite {
  to: string;
  lenderName: string;
  companyName: string;
  link: string; // contains the raw magic-link token: treat as a secret
}

/** Same case link, sent by the borrower to their gestoría. */
export interface DelegateInvite extends BorrowerInvite {
  requestedBy: "borrower";
}

export type LenderEvent = "documents_submitted" | "consent_withdrawn" | "support_requested";

export interface LenderNotice {
  lenderId: string;
  caseId: string;
  companyName: string;
  event: LenderEvent;
  /** What the company wrote (support requests). */
  message?: string | null;
}

/** A lender asks the company for one more document. No link: the company uses the one it already has. */
export interface DocumentRequest {
  to: string;
  lenderName: string;
  companyName: string;
  document: string;
  message: string | null;
}

export interface Notifier {
  sendBorrowerInvite(invite: BorrowerInvite): Promise<{ sent: boolean }>;
  sendDocumentRequest(request: DocumentRequest): Promise<{ sent: boolean }>;
  sendDelegateInvite(invite: DelegateInvite): Promise<{ sent: boolean }>;
  notifyLender(notice: LenderNotice): Promise<{ sent: boolean }>;
}

const devConsoleNotifier: Notifier = {
  async sendDocumentRequest(r) {
    console.info(`[notify:dev] Petición de documento para ${r.to} (${r.companyName}, de ${r.lenderName}): ${r.document}`);
    return { sent: true };
  },
  async sendBorrowerInvite(i) {
    console.info(`[notify:dev] Invitación para ${i.to} (${i.companyName}, de ${i.lenderName}): ${i.link}`);
    return { sent: true };
  },
  async sendDelegateInvite(i) {
    console.info(`[notify:dev] Enlace de gestoría para ${i.to} (${i.companyName}, de ${i.lenderName}): ${i.link}`);
    return { sent: true };
  },
  async notifyLender(n) {
    console.info(`[notify:dev] Aviso al prestamista ${n.lenderId}: ${n.event} en ${n.companyName} (${n.caseId})`);
    return { sent: true };
  },
};

const noopNotifier: Notifier = {
  async sendDocumentRequest() {
    console.warn("[notify] Sin proveedor de correo configurado: petición de documento no enviada.");
    return { sent: false };
  },
  async sendBorrowerInvite() {
    console.warn("[notify] Sin proveedor de correo configurado: invitación no enviada.");
    return { sent: false };
  },
  async sendDelegateInvite() {
    console.warn("[notify] Sin proveedor de correo configurado: enlace de gestoría no enviado.");
    return { sent: false };
  },
  async notifyLender(n) {
    console.warn(`[notify] Sin proveedor de correo configurado: aviso ${n.event} no enviado.`);
    return { sent: false };
  },
};

/** Default sender: Resend's shared test address, which only delivers to the Resend account's own email. */
export const DEFAULT_FROM = "credIA <onboarding@resend.dev>";

export function resendNotifier(apiKey: string, env: { from?: string; replyTo?: string; appUrl?: string } = {}, deps: { recipients?: typeof lenderRecipients; fetchImpl?: typeof fetch } = {}): Notifier {
  const base = { apiKey, from: env.from || DEFAULT_FROM, replyTo: env.replyTo || undefined, fetchImpl: deps.fetchImpl };
  const caseUrl = (caseId: string) => (env.appUrl ? `${env.appUrl.replace(/\/+$/, "")}/casos/${caseId}` : null);
  return {
    sendBorrowerInvite: (i) =>
      sendWithResend(borrowerInviteEmail({ ...i, expiresInDays: MAGIC_LINK_TTL_DAYS }), { ...base, to: i.to, kind: "borrower_invite" }),
    sendDelegateInvite: (i) => sendWithResend(delegateInviteEmail(i), { ...base, to: i.to, kind: "delegate_invite" }),
    sendDocumentRequest: (r) => sendWithResend(documentRequestEmail(r), { ...base, to: r.to, kind: "document_request" }),
    async notifyLender(n) {
      const to = await (deps.recipients ?? lenderRecipients)(n.lenderId);
      if (to.length === 0) return { sent: false };
      return sendWithResend(lenderNoticeEmail({ event: n.event, companyName: n.companyName, caseUrl: caseUrl(n.caseId), message: n.message }), {
        ...base,
        to,
        kind: `lender_${n.event}`,
      });
    },
  };
}

/** True when real emails can go out (a failed send then means the provider rejected it, not "not set up"). */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function getNotifier(): Notifier {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    return resendNotifier(key, { from: process.env.CREDIA_EMAIL_FROM, replyTo: process.env.CREDIA_EMAIL_REPLY_TO, appUrl: normaliseBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ?? undefined });
  }
  return process.env.NODE_ENV === "development" ? devConsoleNotifier : noopNotifier;
}
