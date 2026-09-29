import type { Tone } from "@/components/ui/SeverityDot";

export const CASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_documents: { label: "Esperando documentos", tone: "warn" },
  processing: { label: "Procesando", tone: "info" },
  ready: { label: "Listo para revisión", tone: "ok" },
  needs_review: { label: "Requiere revisión", tone: "high" },
  archived: { label: "Archivado", tone: "neutral" },
};
