/**
 * Per-bank steps to download Norma 43 (Cuaderno 43) files, shown in the borrower portal and used by the
 * documentation assistant. Bracketed text is a placeholder to fill with the bank's real menu path —
 * never replace it with a guess. `**text**` renders bold.
 */
export interface BankGuide {
  id: string;
  name: string;
  steps: string[];
}

const commonTail = [
  "Elige formato **Norma 43 / Cuaderno 43** y el periodo de los últimos 12 meses.",
  "Repite para cada cuenta y sube aquí todos los ficheros.",
];

const named = (id: string, name: string): BankGuide => ({
  id,
  name,
  steps: [`Entra en la banca online de empresas de ${name}.`, "Ve a [RUTA DEL MENÚ PARA DESCARGAR MOVIMIENTOS].", ...commonTail],
});

export const BANKS: BankGuide[] = [
  named("santander", "Santander"),
  named("bbva", "BBVA"),
  named("caixabank", "CaixaBank"),
  named("sabadell", "Sabadell"),
  named("bankinter", "Bankinter"),
  {
    id: "otro",
    name: "Otro banco",
    steps: [
      "Entra en la banca online de empresas de tu banco.",
      "Busca la opción para descargar movimientos o extractos de cuenta.",
      ...commonTail,
    ],
  },
];

/** When the bank cannot export Norma 43. */
export const N43_FALLBACK = "¿Tu banco no exporta Norma 43? Sube los extractos en PDF de los últimos 12 meses y los leemos igual.";
