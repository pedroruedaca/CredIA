/** Spanish copy for «Preguntar al caso» (the analyst's chat about one case) and the analyst's conclusions. */

export const ANALYST_CHAT_COPY = {
  title: "Preguntar al caso",
  barPlaceholder: "Pregunta sobre este caso: cifras, movimientos, verificaciones…",
  opening: "Pregúntame por las cifras, los movimientos bancarios, la CIRBE o las verificaciones de este caso. Cada cifra lleva su origen.",
  disclaimer: "Respuestas a partir de los datos del caso, con su origen. credIA no puntúa ni recomienda: la decisión es tuya.",
  private: "Solo tú ves esta conversación.",
  thinking: "Pensando…",
  failed: "No he podido responder ahora. Inténtalo de nuevo en unos segundos.",
  refused: "No puedo responder a esa pregunta. Puedo darte las cifras, los indicadores y las verificaciones del caso.",
  rateLimited: "Has hecho muchas preguntas seguidas. Espera unos minutos y vuelve a intentarlo.",
  notConfigured: "El asistente no está configurado en este entorno.",
  uncited: (n: number) => (n === 1 ? "Una frase da una cifra sin origen: compruébala antes de usarla." : `${n} frases dan cifras sin origen: compruébalas antes de usarlas.`),
  clear: "Borrar conversación",
  cleared: "Conversación borrada.",
  saveConclusion: "Guardar como conclusión",
  saveConclusionHint: "Se añade al caso y a las exportaciones (PDF, Excel y JSON), con sus fuentes. El equipo la verá.",
  saved: "Guardada en las conclusiones del caso.",
  saveFailed: "No se ha podido guardar la conclusión.",
  editBeforeSaving: "Puedes editar el texto antes de guardarlo. Las fuentes que borres del texto no se guardan.",
} as const;

export const CONCLUSIONS_COPY = {
  title: "Conclusiones del analista",
  intro: "Guardadas desde «Preguntar al caso», con el origen de cada cifra.",
  remove: "Quitar",
  removeConfirm: "¿Quitar esta conclusión del caso y de las exportaciones?",
  question: "Pregunta",
  sources: "Fuentes",
  exportNote: "Conclusiones escritas por el analista a partir de las respuestas de «Preguntar al caso»; cada cifra lleva su origen. No son una puntuación ni una recomendación de credIA.",
} as const;
