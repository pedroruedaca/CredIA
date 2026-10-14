/** Lender sign-in copy (Spanish). */
import type { CodeError, LinkError, OAuthProvider, SendError } from "../lib/auth/login.ts";

export const LOGIN_COPY = {
  title: "Acceso para prestamistas",
  intro: "Te enviaremos un correo con un enlace y un código de acceso. No necesitas contraseña.",
  email: "Correo electrónico",
  send: "Enviar acceso",
  sending: "Enviando…",
  orEmail: "o con tu correo",
  sentTitle: "Correo enviado",
  sentBody: (email: string) => `Hemos enviado un enlace y un código a ${email}.`,
  sentHow: "Abre el enlace en este mismo navegador, o escribe aquí el código: funciona desde cualquier dispositivo.",
  code: "Código del correo",
  enter: "Entrar",
  entering: "Entrando…",
  resend: "Reenviar el correo",
  resendIn: (s: number) => `Puedes pedir otro correo en ${s} s`,
  otherEmail: "Usar otro correo",
  newerWins: "Usa siempre el último correo: cada envío anula el anterior.",
} as const;

export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Continuar con Google", azure: "Continuar con Microsoft" };

export const SEND_ERROR: Record<SendError, string> = {
  rate_limited: "Has pedido varios correos seguidos. Espera un minuto y vuelve a intentarlo; si ya te ha llegado uno, usa ese.",
  no_access: "Este correo no tiene acceso a credIA. Pide a la persona administradora de tu entidad que te invite desde «Ajustes».",
  invalid_email: "Revisa el correo: no parece una dirección válida.",
  unavailable: "No hemos podido enviar el correo ahora mismo. Inténtalo de nuevo en unos minutos.",
};

export const CODE_ERROR: Record<CodeError, string> = {
  wrong_or_expired: "El código no es correcto o ha caducado. Revisa que sea el del último correo, o pide otro.",
  rate_limited: "Demasiados intentos seguidos. Espera un minuto.",
  unavailable: "No hemos podido comprobar el código. Inténtalo de nuevo.",
};

export const LINK_ERROR: Record<LinkError, { pill: string; text: string }> = {
  other_browser: {
    pill: "Otro navegador",
    text: "El enlace se abrió en un navegador distinto del que lo pidió. Pide un correo nuevo aquí y escribe el código que trae: funciona en cualquier dispositivo.",
  },
  expired: { pill: "Enlace caducado", text: "El enlace ha caducado o ya se usó (cada correo nuevo anula el anterior). Pide otro." },
  no_access: { pill: "Sin acceso", text: "Esa cuenta no tiene acceso a credIA. Pide a la persona administradora de tu entidad que te invite desde «Ajustes»." },
  failed: { pill: "No se pudo entrar", text: "Algo ha fallado al entrar. Vuelve a intentarlo." },
};
