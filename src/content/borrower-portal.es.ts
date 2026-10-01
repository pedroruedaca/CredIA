/**
 * Borrower portal copy (Spanish, tuteo). Bracketed text is a placeholder to fill with verified
 * information — never replace it with a guess. `**text**` renders bold.
 */
import type { RequirementKind } from "@/lib/cases/requirements";

export interface ItemCopy {
  title: string;
  description: string;
  /** How to obtain it. Norma 43 uses the per-bank steps in banks.es.ts instead. */
  steps: string[];
}

export const ITEM_COPY: Record<RequirementKind, ItemCopy> = {
  trial_balance: {
    title: "Contabilidad",
    description: "Sumas y saldos del último ejercicio cerrado y del año en curso, o conexión directa con Holded.",
    steps: [
      "En tu programa de contabilidad (A3, Sage, Contasol, Holded, Odoo…) abre el **balance de sumas y saldos**.",
      "Expórtalo en Excel o CSV a nivel de subcuenta: uno del último ejercicio cerrado y otro del año en curso hasta hoy.",
      "Sube aquí los dos ficheros.",
    ],
  },
  norma43: {
    title: "Movimientos bancarios (Norma 43)",
    description: "Últimos 12 meses de cada cuenta de la empresa. Sirve para verificar tus cobros y pagos.",
    steps: [],
  },
  modelo200: {
    title: "Impuesto de Sociedades (Modelo 200)",
    description: "La declaración del último ejercicio presentada en la Agencia Tributaria.",
    steps: [
      "Entra en la sede electrónica de la Agencia Tributaria (sede.agenciatributaria.gob.es), busca el Modelo 200 y abre **Consulta de declaraciones presentadas** (también está en **Mis expedientes**).",
      "Identifícate con el certificado electrónico de la empresa o Cl@ve e indica el NIF de la empresa, el modelo (200) y el ejercicio.",
      "Pulsa **Ver** para abrir la copia de la declaración, descarga el PDF y súbelo aquí.",
    ],
  },
  modelo303: {
    title: "IVA trimestral (Modelo 303)",
    description: "Las declaraciones de IVA de los últimos 4 trimestres presentadas en la Agencia Tributaria.",
    steps: [
      "Entra en la sede electrónica de la Agencia Tributaria (sede.agenciatributaria.gob.es), busca el Modelo 303 y abre **Consulta de declaraciones presentadas** (también está en **Mis expedientes**).",
      "Identifícate con el certificado electrónico de la empresa o Cl@ve e indica el NIF de la empresa, el modelo (303), el ejercicio y, si quieres, el periodo.",
      "Pulsa **Ver** en cada uno de los últimos 4 trimestres (si declaras el IVA cada mes, los 12 meses), descarga los PDF y súbelos aquí.",
    ],
  },
  cuentas_anuales: {
    title: "Cuentas anuales",
    description: "Las del último ejercicio, tal como se depositaron en el Registro Mercantil.",
    steps: ["Pide a tu gestoría el PDF de las cuentas anuales depositadas, o solicita el depósito de cuentas de la empresa en la sede electrónica de los Registradores (sede.registradores.org).", "Súbelo aquí."],
  },
  cirbe: {
    title: "Informe CIRBE del Banco de España",
    description: "Gratuito. Se pide en la sede electrónica del Banco de España con certificado digital de la empresa.",
    steps: [
      "Entra en la sede electrónica del Banco de España (sedeelectronica.bde.es) y abre el trámite **Informe de riesgos de la Central de Información de Riesgos**.",
      "Identifícate con el certificado electrónico de la empresa y solicita el informe. Suele estar listo en unos 15 minutos y se puede descargar durante 20 días.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
  aeat_cert: {
    title: "Certificado de estar al corriente con Hacienda",
    description: "Certificado de la Agencia Tributaria de que la empresa está al corriente de sus obligaciones tributarias.",
    steps: [
      "Entra en la sede electrónica de la Agencia Tributaria (sede.agenciatributaria.gob.es) → **Todas las gestiones** → **Certificados** → **Situación tributaria**.",
      "Identifícate con el certificado electrónico de la empresa o Cl@ve Móvil y solicita el certificado de estar al corriente de obligaciones tributarias. Si el resultado es positivo, lo obtienes en el momento.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
  tgss_cert: {
    title: "Certificado de estar al corriente con la Seguridad Social",
    description: "Certificado de la Tesorería General de la Seguridad Social de que la empresa está al corriente de pago.",
    steps: [
      "Entra en la sede electrónica de la Seguridad Social (sede.seg-social.gob.es) → **Empresas y Profesionales** → **Informes y Certificados**.",
      "Elige el certificado de estar al corriente, identifícate con el certificado electrónico de la empresa y solicítalo.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
  solvency_report: {
    title: "Informe de solvencia",
    description: "Un informe comercial de la empresa de un proveedor de información (Experian, Informa, Axesor, Iberinform…).",
    steps: [
      "Pide el informe de empresa a tu proveedor de información comercial (Experian, Informa, Axesor, Iberinform…); cada uno tiene su propio servicio.",
      "Descarga el informe completo en PDF, tal como lo entrega el proveedor.",
      "Súbelo aquí.",
    ],
  },
};

/** Support contact shown on error pages. `null` until a real address exists: never invent one. */
export const SUPPORT_EMAIL: string | null = null;

/** Initials badge colour when the lender has not set one. */
export const DEFAULT_LENDER_COLOR = "#2B2E6B";

/** One-step-at-a-time flow (design/borrower-flow2.html): timeline label, page heading, one-sentence why. */
export interface StepCopy {
  short: string;
  heading: string;
  why: (lender: string) => string;
  /** Rough time to get the document, shown on pending steps. An estimate for the borrower, not a promise. */
  estimate: string;
}

export const STEP_COPY: Record<RequirementKind, StepCopy> = {
  trial_balance: {
    short: "Contabilidad",
    heading: "Tu contabilidad",
    why: (l) => `El último ejercicio cerrado y el año en curso. Con ella ${l} prepara el balance y la cuenta de resultados sin pedirte más informes.`,
    estimate: "≈ 5 min",
  },
  norma43: {
    short: "Movimientos bancarios",
    heading: "Tus movimientos bancarios",
    why: (l) => `Los últimos 12 meses de cada cuenta de la empresa. Así ${l} puede comprobar tus cobros y pagos sin pedirte extractos uno a uno.`,
    estimate: "≈ 10 min",
  },
  modelo200: {
    short: "Impuesto de Sociedades",
    heading: "Tu Impuesto de Sociedades",
    why: (l) => `La declaración del último ejercicio (Modelo 200). ${l} la usa como referencia oficial del año cerrado.`,
    estimate: "≈ 5 min",
  },
  modelo303: {
    short: "IVA (Modelo 303)",
    heading: "Tus declaraciones de IVA",
    why: (l) => `Los Modelos 303 de los últimos 4 trimestres. ${l} los usa para ver la evolución de tus ventas declaradas.`,
    estimate: "≈ 10 min",
  },
  cuentas_anuales: {
    short: "Cuentas anuales",
    heading: "Tus cuentas anuales",
    why: () => "Las del último ejercicio, tal como se depositaron en el Registro Mercantil.",
    estimate: "≈ 5 min",
  },
  cirbe: {
    short: "Informe CIRBE",
    heading: "Tu informe CIRBE",
    why: (l) => `Un informe gratuito del Banco de España con la financiación de la empresa. Evita que ${l} tenga que pedirte el detalle de cada préstamo.`,
    estimate: "≈ 5 min",
  },
  aeat_cert: {
    short: "Certificado Hacienda",
    heading: "Tu certificado de Hacienda",
    why: () => "El certificado de estar al corriente de tus obligaciones tributarias, expedido por la Agencia Tributaria.",
    estimate: "≈ 3 min",
  },
  tgss_cert: {
    short: "Certificado Seguridad Social",
    heading: "Tu certificado de la Seguridad Social",
    why: () => "El certificado de estar al corriente de pago con la Seguridad Social, expedido por la TGSS.",
    estimate: "≈ 3 min",
  },
  solvency_report: {
    short: "Informe de solvencia",
    heading: "Tu informe de solvencia",
    why: (l) => `Un informe comercial de la empresa (Experian, Informa, Axesor…). ${l} lo usa para conocer incidencias de pago y datos registrales sin pedírtelos uno a uno.`,
    estimate: "≈ 10 min",
  },
};

export const REVIEW_STEP = {
  id: "enviar",
  short: "Revisar y enviar",
  heading: "Revisa y envía",
};
