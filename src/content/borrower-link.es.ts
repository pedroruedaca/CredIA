/** Messages of the company's link while it is opened (landing page `/s`) and when it cannot be used. */
export const LINK_COPY = {
  opening: "Abriendo tu solicitud…",
  invalid: {
    title: "No encontramos este enlace",
    body: "Comprueba que has copiado el enlace completo del correo. Si lo has recibido hace tiempo, puede que se haya sustituido por uno nuevo.",
  },
  expired: {
    title: "Este enlace ha caducado",
    body: "Por seguridad, los enlaces para aportar documentación caducan pasado un tiempo. Pide a la entidad que te lo envió uno nuevo; lo que ya subiste se conserva.",
  },
  // Opened from a copied address bar (another browser, or after clearing cookies): the token is not in it.
  reopen: {
    title: "Abre el enlace desde tu correo",
    body: "Por seguridad, esta dirección solo funciona en el navegador donde abriste el enlace. Vuelve a abrir el enlace del correo que te enviaron; lo que ya subiste se conserva.",
  },
  failed: {
    title: "No hemos podido abrir tu solicitud",
    body: "Comprueba tu conexión y vuelve a abrir el enlace del correo en unos minutos.",
  },
} as const;
