import { afterEach, describe, expect, it, vi } from "vitest";
import { resendNotifier } from "../notify.ts";
import { sendWithResend } from "./resend.ts";
import { borrowerInviteEmail, documentRequestEmail, lenderNoticeEmail } from "./templates.ts";

const LINK = "https://cred-ia.vercel.app/s/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";

describe("templates", () => {
  it("borrower invite: Spanish copy, the link as button and as text, expiry", () => {
    const e = borrowerInviteEmail({ lenderName: "Fondo Ejemplo", companyName: "Talleres Demo, S.L.", link: LINK, expiresInDays: 30 });
    expect(e.subject).toBe("Fondo Ejemplo te pide la documentación de Talleres Demo, S.L.");
    expect(e.html.split(`href="${LINK}"`).length - 1).toBe(2); // button and the fallback address are both links
    expect(e.html).toContain("Aportar la documentación");
    expect(e.text).toContain(LINK);
    expect(e.text).toContain("caduca en 30 días");
  });

  it("escapes names and messages, and keeps subjects on one line", () => {
    const e = documentRequestEmail({ lenderName: "Fondo <b>X</b>", companyName: 'A & "B"', document: "Informe CIRBE\r\nBcc: x@y.z", message: "<script>alert(1)</script>\nGracias" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("Fondo &lt;b&gt;X&lt;/b&gt;");
    expect(e.html).toContain("A &amp; &quot;B&quot;");
    expect(e.subject).not.toMatch(/[\r\n]/);
  });

  it("lender notice: event copy, case link when the app URL is known, company message", () => {
    const e = lenderNoticeEmail({ event: "support_requested", companyName: "Talleres Demo", caseUrl: "https://x/casos/1", message: "No encuentro el CIRBE" });
    expect(e.subject).toBe("Talleres Demo pide hablar con una persona");
    expect(e.html).toContain('href="https://x/casos/1"');
    expect(e.html).toContain("No encuentro el CIRBE");
    expect(lenderNoticeEmail({ event: "documents_submitted", companyName: "T", caseUrl: null }).text).toContain("Entra en credIA");
  });
});

describe("sendWithResend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to Resend with the key, sender, recipients and both bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const r = await sendWithResend({ subject: "S", html: "<p>H</p>", text: "T" }, { apiKey: "re_test", from: "credIA <a@b.es>", to: "c@d.es", replyTo: "r@b.es", kind: "t", fetchImpl });
    expect(r).toEqual({ sent: true, id: "em_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({ from: "credIA <a@b.es>", to: ["c@d.es"], subject: "S", html: "<p>H</p>", text: "T", reply_to: "r@b.es" });
  });

  it("reports failure without logging the body, link or API key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: `bad ${LINK}` }), { status: 422 }));
    const r = await sendWithResend(borrowerInviteEmail({ lenderName: "F", companyName: "C", link: LINK }), { apiKey: "re_secret", from: "x", to: "c@d.es", kind: "borrower_invite", fetchImpl });
    expect(r.sent).toBe(false);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("HTTP 422 validation_error");
    expect(logged).not.toContain(LINK);
    expect(logged).not.toContain("re_secret");
  });

  it("network errors are a failed send, not a crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await sendWithResend({ subject: "s", html: "h", text: "t" }, { apiKey: "k", from: "f", to: "a@b.es", kind: "t", fetchImpl })).toEqual({ sent: false });
  });
});

describe("resendNotifier", () => {
  it("sends lender notices to the lender's owners and analysts, with a link to the case", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "em_2" }), { status: 200 }));
    const n = resendNotifier("re_k", { appUrl: "https://cred-ia.vercel.app/" }, { recipients: async () => ["ana@fondo.es", "luis@fondo.es"], fetchImpl });
    expect(await n.notifyLender({ lenderId: "l1", caseId: "c1", companyName: "Talleres Demo", event: "documents_submitted" })).toMatchObject({ sent: true });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(["ana@fondo.es", "luis@fondo.es"]);
    expect(body.from).toBe("credIA <onboarding@resend.dev>");
    expect(body.html).toContain("https://cred-ia.vercel.app/casos/c1");
  });

  it("does not call Resend when the lender has nobody to notify", async () => {
    const fetchImpl = vi.fn();
    const n = resendNotifier("re_k", {}, { recipients: async () => [], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await n.notifyLender({ lenderId: "l1", caseId: "c1", companyName: "T", event: "consent_withdrawn" })).toEqual({ sent: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("borrower invite: documents the company is asked for", () => {
  it("lists them when given, escaped", () => {
    const e = borrowerInviteEmail({ lenderName: "F", companyName: "C", link: LINK, documents: ["Contabilidad", "Informe <CIRBE>"] });
    expect(e.text).toContain("Te pide: Contabilidad, Informe <CIRBE>.");
    expect(e.html).toContain("Informe &lt;CIRBE&gt;");
    expect(borrowerInviteEmail({ lenderName: "F", companyName: "C", link: LINK }).text).not.toContain("Te pide");
  });
});
