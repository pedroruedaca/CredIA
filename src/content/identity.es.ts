/** «Identidad y titularidad» module copy (case view and PDF). Facts only: no verdict on the company. */
export const IDENTITY_COPY = {
  notaParsed: (date: string) => `Nota simple del ${date}`,
  notaReading: "Leyendo la nota simple…",
  notaFailed: "Nota simple sin leer",
  notaRequested: "Nota simple pedida a la empresa",
  notaYours: "Te toca subir la nota simple",
  notaNone: "Sin nota simple",
  formerNames: (names: string[]) => `Antes: ${names.join(" · ")}`,
  boardTitle: "Administradores y apoderados",
  boardUnknown: "Sin nota simple ni empresa confirmada en el Registro Mercantil: no se sabe quién la administra.",
  boardEmpty: "No queda ningún cargo vigente en las fuentes disponibles.",
  checksTitle: "Verificaciones de identidad",
  footnote: "Datos del Registro Mercantil (nota simple y BORME) con su origen. credIA no valora la identidad de la empresa: compara las fuentes.",
};
