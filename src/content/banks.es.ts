/**
 * Per-bank steps to download Norma 43 (Cuaderno 43) files. Shown in the borrower checklist and passed to the
 * documentation assistant. Bracketed values are placeholders to be filled with verified menu paths:
 * never replace them with guesses.
 */
export interface BankGuide {
  id: string;
  label: string;
  steps: string[];
}

const genericSteps = (bank: string, menuPath: string): string[] => [
  `Entra en la banca online de empresas de ${bank}.`,
  `Ve a ${menuPath}.`,
  "Elige formato **Norma 43 / Cuaderno 43** y el periodo de los últimos 12 meses.",
  "Repite para cada cuenta y sube aquí todos los ficheros.",
];

export const BANKS: BankGuide[] = [
  { id: "santander", label: "Santander", steps: genericSteps("Santander", "[RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS · SANTANDER]") },
  { id: "bbva", label: "BBVA", steps: genericSteps("BBVA", "[RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS · BBVA]") },
  { id: "caixabank", label: "CaixaBank", steps: genericSteps("CaixaBank", "[RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS · CAIXABANK]") },
  { id: "sabadell", label: "Sabadell", steps: genericSteps("Sabadell", "[RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS · SABADELL]") },
  { id: "bankinter", label: "Bankinter", steps: genericSteps("Bankinter", "[RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS · BANKINTER]") },
  {
    id: "otro",
    label: "Otro banco",
    steps: [
      "Entra en la banca online de empresas de tu banco.",
      "Busca la opción para descargar movimientos o extractos de cuenta.",
      "Elige formato **Norma 43 / Cuaderno 43** y el periodo de los últimos 12 meses.",
      "Repite para cada cuenta y sube aquí todos los ficheros.",
    ],
  },
];

export const BANK_IDS = BANKS.map((b) => b.id);

/** Fallback when a bank does not export Norma 43. */
export const N43_FALLBACK =
  "Si tu banco no exporta Norma 43, sube los extractos en PDF de los últimos 12 meses y los leemos igual.";
