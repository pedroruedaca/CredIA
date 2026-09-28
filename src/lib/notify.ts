/**
 * Outbound notifications behind an interface. No email provider yet: in development the invite is
 * printed to the server console so the flow can be tested; elsewhere nothing is sent and no link is logged.
 */
export interface BorrowerInvite {
  to: string;
  lenderName: string;
  companyName: string;
  link: string; // contains the raw magic-link token: treat as a secret
}

export interface Notifier {
  sendBorrowerInvite(invite: BorrowerInvite): Promise<{ sent: boolean }>;
}

const devConsoleNotifier: Notifier = {
  async sendBorrowerInvite(i) {
    console.info(`[notify:dev] Invitación para ${i.to} (${i.companyName}, de ${i.lenderName}): ${i.link}`);
    return { sent: true };
  },
};

const noopNotifier: Notifier = {
  async sendBorrowerInvite() {
    console.warn("[notify] Sin proveedor de correo configurado: invitación no enviada.");
    return { sent: false };
  },
};

export function getNotifier(): Notifier {
  return process.env.NODE_ENV === "development" ? devConsoleNotifier : noopNotifier;
}
