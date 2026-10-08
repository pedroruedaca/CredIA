/** «Cerrar caso» / «Reabrir caso» and the retention settings in Ajustes (0025). */
import type { ClosedReason, CloseReason } from "@/lib/cases/closing";

export const CLOSE_REASON_LABEL: Record<ClosedReason, string> = {
  decided: "Decidido",
  declined: "Denegado",
  withdrawn: "Retirado por la empresa",
  inactive: "Sin actividad",
};

export const CLOSE_REASON_HINT: Record<CloseReason, string> = {
  decided: "La entidad ya ha tomado su decisión sobre la solicitud.",
  declined: "La entidad no sigue adelante con la solicitud.",
  withdrawn: "La empresa ya no quiere seguir con la solicitud.",
};

export const CLOSE_CASE_COPY = {
  button: "Cerrar caso",
  title: (company: string) => `¿Cerrar el caso de ${company}?`,
  reasonLabel: "Motivo",
  effects: [
    "El enlace de la empresa y los de su gestoría dejan de funcionar.",
    "Si la empresa dejó guardada su clave de Holded, se borra.",
    "El equipo sigue viendo el caso y puede exportarlo o reabrirlo hasta que se elimine.",
  ],
  retention: (months: number) =>
    `Tu entidad conserva los casos cerrados ${monthsText(months)}; después se eliminan para siempre, con aviso 14 días antes. Puedes cambiar el plazo en Ajustes.`,
  confirm: "Cerrar caso",
  closing: "Cerrando…",
  failed: "No hemos podido cerrar el caso. Inténtalo de nuevo.",
} as const;

export const REOPEN_CASE_COPY = {
  button: "Reabrir caso",
  reopening: "Reabriendo…",
  failed: "No hemos podido reabrir el caso. Inténtalo de nuevo.",
} as const;

/** Line under the header of a closed case. */
export const closedLine = (o: { closedOn: string; reason: ClosedReason | null; deleteOn: string | null; announced: boolean; months: number | null }) =>
  [
    `Cerrado el ${o.closedOn}${o.reason ? ` · ${CLOSE_REASON_LABEL[o.reason]}` : ""}.`,
    o.deleteOn && o.announced
      ? `Se eliminará el ${o.deleteOn}, con todos sus documentos y datos. Si necesitas una copia, descárgala antes («Exportar paquete» → «Descargar todo»).`
      : o.deleteOn && o.months
        ? `Se eliminará el ${o.deleteOn} (${monthsText(o.months)} desde el cierre, plazo de tu entidad); avisaremos 14 días antes.`
        : null,
  ]
    .filter(Boolean)
    .join(" ");

export function monthsText(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "1 año" : `${years} años`;
  }
  return months === 1 ? "1 mes" : `${months} meses`;
}

export const RETENTION_COPY = {
  title: "Conservación de datos",
  intro:
    "Tu entidad decide cuánto tiempo se guardan los casos cerrados: es la responsable de los datos. Si alguna norma te obliga a conservarlos más tiempo (por ejemplo, la de prevención del blanqueo cuando financias a la empresa), elige un plazo mayor.",
  retentionLabel: "Conservar los casos cerrados",
  retentionHint: "Desde el cierre. Después, el caso y sus archivos se eliminan para siempre; avisamos a los administradores 14 días antes.",
  autoCloseLabel: "Cerrar los casos sin actividad",
  autoCloseHint: "Cuenta desde la última acción de una persona (tu equipo, la empresa o su gestoría).",
  never: "Nunca",
  after: (months: number) => `Tras ${monthsText(months)} sin actividad`,
  keep: (months: number) => monthsText(months),
  saved: "Guardado.",
} as const;
