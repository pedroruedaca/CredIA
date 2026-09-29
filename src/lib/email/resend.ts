/**
 * Sends one email through Resend's HTTP API (no SDK). Logs only the outcome and Resend's message id: never the
 * body or the recipient's link (borrower invites contain the magic-link token).
 */
import type { Email } from "./templates.ts";

export interface SendOptions {
  apiKey: string;
  from: string;
  to: string | string[];
  replyTo?: string;
  /** Short label for logs, e.g. "borrower_invite". */
  kind: string;
  fetchImpl?: typeof fetch;
}

export async function sendWithResend(email: Email, o: SendOptions): Promise<{ sent: boolean; id?: string }> {
  const to = (Array.isArray(o.to) ? o.to : [o.to]).filter(Boolean);
  if (to.length === 0) return { sent: false };
  try {
    const res = await (o.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: o.from, to, subject: email.subject, html: email.html, text: email.text, ...(o.replyTo ? { reply_to: o.replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
    if (!res.ok) {
      // Resend error names are safe to log (e.g. "validation_error"); their messages may echo addresses, so skip them.
      console.error(`[email] ${o.kind} not sent: HTTP ${res.status} ${json.name ?? ""}`.trim());
      return { sent: false };
    }
    console.info(`[email] ${o.kind} sent (${json.id ?? "no id"}) to ${to.length} recipient${to.length === 1 ? "" : "s"}`);
    return { sent: true, id: json.id };
  } catch (err) {
    console.error(`[email] ${o.kind} not sent: ${err instanceof Error ? err.name : "error"}`);
    return { sent: false };
  }
}
