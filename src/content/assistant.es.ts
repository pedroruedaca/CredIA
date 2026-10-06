/** Documentation assistant copy (Spanish, tuteo). */
import type { RequirementKind } from "@/lib/cases/requirements";

/** How the assistant names each document mid-sentence ("Te faltan …"). */
export const SHORT_NAME: Record<RequirementKind, string> = {
  trial_balance: "la contabilidad",
  norma43: "los movimientos bancarios",
  modelo200: "el Modelo 200",
  modelo303: "los Modelos 303 de IVA",
  cuentas_anuales: "las cuentas anuales",
  cirbe: "el informe CIRBE",
  aeat_cert: "el certificado de Hacienda",
  tgss_cert: "el certificado de la Seguridad Social",
  solvency_report: "el informe de solvencia",
};

/** Same, for items that need fixing ("… y un certificado de la Seguridad Social más reciente"). */
export const FIX_NAME: Record<RequirementKind, string> = {
  trial_balance: "revisar la contabilidad",
  norma43: "revisar los movimientos bancarios",
  modelo200: "revisar el Modelo 200",
  modelo303: "revisar los Modelos 303 de IVA",
  cuentas_anuales: "revisar las cuentas anuales",
  cirbe: "revisar el informe CIRBE",
  aeat_cert: "un certificado de Hacienda más reciente",
  tgss_cert: "un certificado de la Seguridad Social más reciente",
  solvency_report: "un informe de solvencia más reciente",
};

/** Chip label for "how do I get X?". */
export const CHIP_NAME: Record<RequirementKind, string> = {
  trial_balance: "Contabilidad",
  norma43: "Movimientos bancarios",
  modelo200: "Modelo 200",
  modelo303: "Modelo 303 (IVA)",
  cuentas_anuales: "Cuentas anuales",
  cirbe: "Informe CIRBE",
  aeat_cert: "Certificado de Hacienda",
  tgss_cert: "Certificado Seguridad Social",
  solvency_report: "Informe de solvencia",
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
  barPlaceholder: "Pregunta lo que necesites sobre tus documentos…",
  failed: "No he podido responder ahora mismo. Vuelve a intentarlo en unos minutos o pulsa «Hablar con una persona».",
  refused: "Con eso no puedo ayudarte. Solo te ayudo a conseguir y subir los documentos de esta solicitud.",
  humanSent: (lender: string) => `Hemos avisado a ${lender}. Se pondrán en contacto contigo por correo.`,
};

/** Tip bubble for the current step: static text from the docs guide, no model call. */
export const STEP_TIP: Record<RequirementKind | "enviar", string> = {
  trial_balance: "Si usas Holded, conectarlo es lo más rápido: no tienes que exportar nada. Si no, cualquier programa de contabilidad exporta el sumas y saldos a Excel.",
  norma43: "Si tu banco online no exporta Norma 43, descarga los movimientos en Excel o CSV, o los extractos en PDF de los últimos 12 meses: también los leemos.",
  modelo200: "Si lo presentó tu gestoría, pídele el PDF de la declaración presentada: lo tendrá a mano.",
  modelo303: "Sube un PDF por trimestre (o por mes, si declaras mensualmente). Tu gestoría tendrá los justificantes de presentación.",
  cuentas_anuales: "Tu gestoría suele tener el PDF de las cuentas que depositó en el Registro Mercantil.",
  cirbe: "Necesitas el certificado digital de la empresa. Si no lo tienes, tu gestoría puede pedirlo por ti.",
  aeat_cert: "Sube el PDF original que descargas de la sede electrónica, no una foto ni un escaneo.",
  tgss_cert: "Sube el PDF original que descargas de la sede electrónica, no una foto ni un escaneo.",
  solvency_report: "Sube el informe completo tal como te lo entrega el proveedor, no un resumen ni una captura.",
  enviar: "Cuando lo envíes, la entidad podrá revisarlo. Si te pide algo más, aparecerá aquí.",
};

/** Suggestion pills for the current step. */
export const STEP_SUGGESTIONS: Record<RequirementKind | "enviar", string[]> = {
  trial_balance: ["¿Qué es el sumas y saldos?", "¿Cómo conecto Holded?", "¿Por qué lo pedís?"],
  norma43: ["¿Qué es Norma 43?", "¿Por qué lo pedís?", "Mi banco no aparece"],
  modelo200: ["¿Dónde lo descargo?", "¿Por qué lo pedís?", "Lo lleva mi gestoría"],
  modelo303: ["¿Qué trimestres?", "Declaro el IVA mensualmente", "Lo lleva mi gestoría"],
  cuentas_anuales: ["¿Dónde las consigo?", "¿Son obligatorias?", "Lo lleva mi gestoría"],
  cirbe: ["¿Qué es la CIRBE?", "No tengo certificado digital", "¿Por qué lo pedís?"],
  aeat_cert: ["¿Cómo lo pido?", "¿Qué antigüedad vale?", "Lo lleva mi gestoría"],
  tgss_cert: ["¿Cómo lo pido?", "¿Qué antigüedad vale?", "Lo lleva mi gestoría"],
  solvency_report: ["¿Dónde lo consigo?", "¿Qué proveedor vale?", "¿Por qué lo pedís?"],
  enviar: ["¿Qué pasa al enviar?", "¿Puedo añadir algo después?"],
};
