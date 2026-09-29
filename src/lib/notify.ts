/**
 * Outbound notifications behind an interface. No email provider yet: in development messages are
 * printed to the server console so the flow can be tested; elsewhere nothing is sent and no link is logged.
 */
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

export type LenderEvent = "documents_submitted" | "consent_withdrawn";

export interface LenderNotice {
  lenderId: string;
  caseId: string;
  companyName: string;
  event: LenderEvent;
}

export interface Notifier {
  sendBorrowerInvite(invite: BorrowerInvite): Promise<{ sent: boolean }>;
  sendDelegateInvite(invite: DelegateInvite): Promise<{ sent: boolean }>;
  notifyLender(notice: LenderNotice): Promise<{ sent: boolean }>;
}

const devConsoleNotifier: Notifier = {
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

export function getNotifier(): Notifier {
  return process.env.NODE_ENV === "development" ? devConsoleNotifier : noopNotifier;
}
