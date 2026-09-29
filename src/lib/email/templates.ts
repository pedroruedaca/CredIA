/**
 * Transactional emails (Spanish), in the v2 look: white, ink text, one ink pill button, no borders. Every value
 * that comes from a user (names, messages) is HTML-escaped. Each template returns subject, HTML and plain text.
 * Pure: no sending, no logging (invite bodies contain the magic link, which is a secret).
 */

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Subjects are plain text but must not carry line breaks (header injection). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function layout(o: { preheader: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; note?: string; footer: string }): string {
  const p = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#4B4F56">${html}</p>`;
  const button = o.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:#111315">
<a href="${esc(o.button.url)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px">${esc(o.button.label)}</a>
</td></tr></table>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;font-family:${FONT};color:#111315">
<tr><td style="padding-bottom:28px;font-size:17px;font-weight:700;letter-spacing:-0.02em">cred<span style="color:#0E5A61">IA</span></td></tr>
<tr><td>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:#111315">${esc(o.heading)}</h1>
${o.paragraphs.map(p).join("\n")}
${button}
${o.note ? `<p style="margin:0 0 16px;padding:14px 16px;border-radius:14px;background:#F6F6F3;font-size:14px;line-height:1.5;color:#4B4F56">${o.note}</p>` : ""}
</td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:1.5;color:#6B6F76">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const text = (lines: (string | null | undefined)[]) => lines.filter((l) => l !== null && l !== undefined).join("\n\n");

const FOOTER_BORROWER = (lender: string) =>
  `Te escribimos en nombre de ${esc(lender)}, que usa credIA para recoger la documentación de su solicitud. Solo ${esc(lender)} verá lo que aportes. Si no esperabas este correo, puedes ignorarlo.`;

// ------------------------------------------------------------------------------------------------ borrower

export function borrowerInviteEmail(i: { lenderName: string; companyName: string; link: string; expiresInDays?: number }): Email {
  const company = i.companyName || "tu empresa";
  const expires = i.expiresInDays ? `El enlace es personal y caduca en ${i.expiresInDays} días.` : "El enlace es personal: no lo reenvíes.";
  return {
    subject: oneLine(`${i.lenderName} te pide la documentación de ${company}`),
    html: layout({
      preheader: `Sube tu documentación en unos minutos. ${expires}`,
      heading: `Documentación para ${company}`,
      paragraphs: [
        `${esc(i.lenderName)} necesita algunos documentos para estudiar la solicitud de financiación de <b style="color:#111315">${esc(company)}</b>.`,
        "Desde este enlace puedes subirlos paso a paso, conectar Holded si lo usas o pedírselos a tu gestoría. Un asistente te explica cómo conseguir cada uno.",
      ],
      button: { label: "Aportar la documentación", url: i.link },
      note: `${expires} Si el botón no funciona, copia esta dirección en tu navegador:<br><a href="${esc(i.link)}" style="word-break:break-all;color:#0E5A61;text-decoration:underline">${esc(i.link)}</a>`,
      footer: FOOTER_BORROWER(i.lenderName),
    }),
    text: text([
      `${i.lenderName} necesita algunos documentos para estudiar la solicitud de financiación de ${company}.`,
      "Súbelos desde este enlace:",
      i.link,
      expires,
      `Te escribimos en nombre de ${i.lenderName}, que usa credIA. Si no esperabas este correo, puedes ignorarlo.`,
    ]),
  };
}

export function delegateInviteEmail(i: { lenderName: string; companyName: string; link: string }): Email {
  const company = i.companyName || "vuestro cliente";
  return {
    subject: oneLine(`${company} os pide su documentación para ${i.lenderName}`),
    html: layout({
      preheader: `Enlace para aportar la documentación de ${company}.`,
      heading: `Documentación de ${company}`,
      paragraphs: [
        `<b style="color:#111315">${esc(company)}</b> os pide que aportéis su documentación para una solicitud de financiación con ${esc(i.lenderName)}.`,
        "Con este enlace podéis subir los ficheros directamente; la empresa verá el progreso.",
      ],
      button: { label: "Aportar la documentación", url: i.link },
      note: `Si el botón no funciona, copia esta dirección en tu navegador:<br><a href="${esc(i.link)}" style="word-break:break-all;color:#0E5A61;text-decoration:underline">${esc(i.link)}</a>`,
      footer: FOOTER_BORROWER(i.lenderName),
    }),
    text: text([`${company} os pide que aportéis su documentación para ${i.lenderName}.`, i.link]),
  };
}

export function documentRequestEmail(r: { lenderName: string; companyName: string; document: string; message: string | null }): Email {
  const company = r.companyName || "tu empresa";
  return {
    subject: oneLine(`${r.lenderName} te pide un documento más: ${r.document}`),
    html: layout({
      preheader: `Falta: ${r.document}.`,
      heading: "Un documento más para tu solicitud",
      paragraphs: [
        `${esc(r.lenderName)} ha añadido <b style="color:#111315">${esc(r.document)}</b> a la documentación de ${esc(company)}.`,
        "Entra con el mismo enlace que usaste para subir el resto: ya aparece en tu lista. Si no lo encuentras, pide a la entidad que te envíe uno nuevo.",
      ],
      note: r.message ? `Mensaje de ${esc(r.lenderName)}:<br><span style="color:#111315">${esc(r.message).replace(/\n/g, "<br>")}</span>` : undefined,
      footer: FOOTER_BORROWER(r.lenderName),
    }),
    text: text([
      `${r.lenderName} ha añadido ${r.document} a la documentación de ${company}.`,
      "Entra con el mismo enlace que usaste para subir el resto: ya aparece en tu lista.",
      r.message ? `Mensaje de ${r.lenderName}: ${r.message}` : null,
    ]),
  };
}

// ------------------------------------------------------------------------------------------------ lender

export function teamInviteEmail(i: { lenderName: string; invitedBy: string; loginUrl: string; role: "owner" | "analyst" | "viewer" }): Email {
  const role = { owner: "administrador", analyst: "analista", viewer: "consulta" }[i.role];
  return {
    subject: oneLine(`Te han invitado a ${i.lenderName} en credIA`),
    html: layout({
      preheader: `Acceso a los casos de ${i.lenderName}.`,
      heading: `Te han invitado a ${i.lenderName}`,
      paragraphs: [
        `${esc(i.invitedBy)} te ha dado acceso a credIA como <b style="color:#111315">${role}</b> de ${esc(i.lenderName)}.`,
        "Entra con este correo: te enviaremos un enlace de acceso, sin contraseña.",
      ],
      button: { label: "Entrar en credIA", url: i.loginUrl },
      footer: "credIA prepara paquetes de datos de crédito para prestamistas. Si no esperabas esta invitación, puedes ignorar este correo.",
    }),
    text: text([`${i.invitedBy} te ha dado acceso a credIA como ${role} de ${i.lenderName}.`, `Entra con este correo en ${i.loginUrl}`]),
  };
}

export type LenderEventKind = "documents_submitted" | "consent_withdrawn" | "support_requested";

const LENDER_COPY: Record<LenderEventKind, { subject: (c: string) => string; line: (c: string) => string; button: string }> = {
  documents_submitted: {
    subject: (c) => `${c} ha enviado su documentación`,
    line: (c) => `<b style="color:#111315">${c}</b> ha enviado su documentación. credIA está leyéndola; el paquete estará listo en unos minutos.`,
    button: "Abrir el caso",
  },
  consent_withdrawn: {
    subject: (c) => `${c} ha retirado su consentimiento`,
    line: (c) => `<b style="color:#111315">${c}</b> ha retirado su consentimiento. Ya no puede aportar documentos y deberías contactar con la empresa sobre los ya compartidos.`,
    button: "Ver el caso",
  },
  support_requested: {
    subject: (c) => `${c} pide hablar con una persona`,
    line: (c) => `<b style="color:#111315">${c}</b> ha pedido ayuda con su documentación. Responde a la empresa por correo o teléfono.`,
    button: "Ver el caso",
  },
};

export function lenderNoticeEmail(n: { event: LenderEventKind; companyName: string; caseUrl: string | null; message?: string | null }): Email {
  const company = n.companyName || "Una empresa";
  const copy = LENDER_COPY[n.event];
  return {
    subject: oneLine(copy.subject(company)),
    html: layout({
      preheader: oneLine(copy.subject(company)),
      heading: oneLine(copy.subject(company)),
      paragraphs: [copy.line(esc(company)), ...(n.caseUrl ? [] : ["Entra en credIA para verlo."])],
      button: n.caseUrl ? { label: copy.button, url: n.caseUrl } : undefined,
      note: n.message ? `Mensaje de la empresa:<br><span style="color:#111315">${esc(n.message).replace(/\n/g, "<br>")}</span>` : undefined,
      footer: "Aviso automático de credIA. credIA verifica y organiza la información; no puntúa ni recomienda.",
    }),
    text: text([copy.subject(company) + ".", n.message ? `Mensaje de la empresa: ${n.message}` : null, n.caseUrl ?? "Entra en credIA para verlo."]),
  };
}
