/**
 * Borrower portal copy (Spanish, tuteo). Descriptions come from design/borrower-checklist.html; keep them free of
 * menu paths or URLs that have not been verified. Bracketed values are placeholders, never invented.
 */
import type { RequirementKind } from "@/lib/cases/requirements";

export interface ChecklistCopy {
  title: string;
  description: string;
  /** Accepted files, shown under the drop zone. */
  accepts: string;
}

export const CHECKLIST_COPY: Record<RequirementKind, ChecklistCopy> = {
  trial_balance: {
    title: "Contabilidad",
    description: "Conecta Holded o sube el balance de sumas y saldos del último ejercicio cerrado y del año en curso.",
    accepts: ".xlsx, .xls, .csv",
  },
  norma43: {
    title: "Movimientos bancarios (Norma 43)",
    description: "Últimos 12 meses de cada cuenta de la empresa. Sirve para verificar tus cobros y pagos.",
    accepts: ".n43, .txt, .aeb · varios ficheros a la vez",
  },
  modelo200: {
    title: "Impuesto de Sociedades (Modelo 200)",
    description: "La declaración del último ejercicio cerrado, en PDF.",
    accepts: ".pdf",
  },
  cuentas_anuales: {
    title: "Cuentas anuales",
    description: "Las depositadas en el Registro Mercantil del último ejercicio cerrado, en PDF.",
    accepts: ".pdf",
  },
  cirbe: {
    title: "Informe CIRBE del Banco de España",
    description: "Gratuito. Se pide en la sede electrónica del Banco de España con certificado digital de la empresa.",
    accepts: ".pdf",
  },
  aeat_cert: {
    title: "Certificado de estar al corriente con Hacienda",
    description: "Certificado de la Agencia Tributaria de estar al corriente de obligaciones tributarias, en PDF.",
    accepts: ".pdf",
  },
  tgss_cert: {
    title: "Certificado de estar al corriente con la Seguridad Social",
    description: "Certificado de la Tesorería General de la Seguridad Social de estar al corriente, en PDF.",
    accepts: ".pdf",
  },
};

export const SUPPORT_EMAIL = "[EMAIL DE SOPORTE]";

export const PORTAL_COPY = {
  heading: "Documentación para tu solicitud",
  intro: (lender: string) =>
    `Cuanto antes esté completa, antes podrá responderte ${lender}. Te explicamos cómo conseguir cada documento; la mayoría tarda menos de cinco minutos.`,
  managedBy: "Proceso gestionado con",
  submit: "Enviar documentación",
  submitted: (lender: string) => `Documentación enviada. ${lender} ya puede revisarla. Si te pide algo más, lo verás aquí.`,
  remaining: (n: number) =>
    n === 1 ? "Falta 1 documento. Tu progreso se guarda automáticamente." : `Faltan ${n} documentos. Tu progreso se guarda automáticamente.`,
  allDone: "Todo listo. Revisa que esté todo y envía la documentación.",
  delegateBanner: (company: string) => `Estás aportando documentación en nombre de ${company}.`,
};
