/** Documentation assistant copy (Spanish, tuteo). */
import type { RequirementKind } from "@/lib/cases/requirements";

/** How the assistant names each document mid-sentence ("Te faltan …"). */
export const SHORT_NAME: Record<RequirementKind, string> = {
  trial_balance: "la contabilidad",
  norma43: "los movimientos bancarios",
  modelo200: "el Modelo 200",
  cuentas_anuales: "las cuentas anuales",
  cirbe: "el informe CIRBE",
  aeat_cert: "el certificado de Hacienda",
  tgss_cert: "el certificado de la Seguridad Social",
};

/** Same, for items that need fixing ("… y un certificado de la Seguridad Social más reciente"). */
export const FIX_NAME: Record<RequirementKind, string> = {
  trial_balance: "revisar la contabilidad",
  norma43: "revisar los movimientos bancarios",
  modelo200: "revisar el Modelo 200",
  cuentas_anuales: "revisar las cuentas anuales",
  cirbe: "revisar el informe CIRBE",
  aeat_cert: "un certificado de Hacienda más reciente",
  tgss_cert: "un certificado de la Seguridad Social más reciente",
};

/** Chip label for "how do I get X?". */
export const CHIP_NAME: Record<RequirementKind, string> = {
  trial_balance: "Contabilidad",
  norma43: "Movimientos bancarios",
  modelo200: "Modelo 200",
  cuentas_anuales: "Cuentas anuales",
  cirbe: "Informe CIRBE",
  aeat_cert: "Certificado de Hacienda",
  tgss_cert: "Certificado Seguridad Social",
};

export const ASSISTANT_COPY = {
  title: "Asistente de documentación",
  subtitle: "Te guía para conseguir cada documento",
  placeholder: "Escribe tu pregunta…",
  disclaimer: "Solo ayuda con la documentación; no conoce ni opina sobre la decisión de crédito.",
  human: "Hablar con una persona",
  whyChip: "¿Por qué pedís esto?",
  gestoriaChip: "Lo lleva mi gestoría",
  rateLimited: "Has hecho muchas preguntas en poco tiempo. Espera un rato o pulsa «Hablar con una persona».",
  failed: "No he podido responder ahora mismo. Vuelve a intentarlo en unos minutos o pulsa «Hablar con una persona».",
  refused: "Con eso no puedo ayudarte. Solo te ayudo a conseguir y subir los documentos de esta solicitud.",
  humanSent: (lender: string) => `Hemos avisado a ${lender}. Se pondrán en contacto contigo por correo.`,
};
