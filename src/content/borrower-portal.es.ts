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
      "Entra en la sede electrónica de la Agencia Tributaria → [RUTA PARA DESCARGAR EL MODELO 200 PRESENTADO].",
      "Identifícate con el certificado digital de la empresa.",
      "Descarga el PDF de la declaración presentada y súbelo aquí.",
    ],
  },
  cuentas_anuales: {
    title: "Cuentas anuales",
    description: "Las del último ejercicio, tal como se depositaron en el Registro Mercantil.",
    steps: ["Pide a tu gestoría el PDF de las cuentas anuales depositadas, o descárgalo en [RUTA DEL REGISTRO MERCANTIL].", "Súbelo aquí."],
  },
  cirbe: {
    title: "Informe CIRBE del Banco de España",
    description: "Gratuito. Se pide en la sede electrónica del Banco de España con certificado digital de la empresa.",
    steps: [
      "Entra en la sede electrónica del Banco de España → **[RUTA DEL TRÁMITE CIRBE]**.",
      "Identifícate con el certificado digital de la empresa.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
  aeat_cert: {
    title: "Certificado de estar al corriente con Hacienda",
    description: "Certificado de la Agencia Tributaria de que la empresa está al corriente de sus obligaciones tributarias.",
    steps: [
      "Entra en la sede electrónica de la Agencia Tributaria → [RUTA DEL CERTIFICADO DE ESTAR AL CORRIENTE].",
      "Identifícate con el certificado digital de la empresa y solicita el certificado.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
  tgss_cert: {
    title: "Certificado de estar al corriente con la Seguridad Social",
    description: "Certificado de la Tesorería General de la Seguridad Social de que la empresa está al corriente de pago.",
    steps: [
      "Entra en la sede electrónica de la Seguridad Social → [RUTA DEL CERTIFICADO DE ESTAR AL CORRIENTE].",
      "Identifícate con el certificado digital de la empresa y solicita el certificado.",
      "Descarga el PDF y súbelo aquí.",
    ],
  },
};

/** Support contact shown on error pages. `null` until a real address exists: never invent one. */
export const SUPPORT_EMAIL: string | null = null;

/** Initials badge colour when the lender has not set one. */
export const DEFAULT_LENDER_COLOR = "#2B2E6B";
