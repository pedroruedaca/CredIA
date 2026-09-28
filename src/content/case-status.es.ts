export const CASE_STATUS: Record<string, { label: string; className: string }> = {
  awaiting_documents: { label: "Esperando documentos", className: "bg-warn-bg text-warn" },
  processing: { label: "Procesando", className: "bg-info-bg text-info" },
  ready: { label: "Listo para revisión", className: "bg-ok-bg text-ok" },
  needs_review: { label: "Requiere revisión", className: "bg-high-bg text-high" },
  archived: { label: "Archivado", className: "bg-line-row text-muted" },
};
