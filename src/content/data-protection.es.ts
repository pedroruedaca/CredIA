/**
 * Data protection copy: the privacy notice the company sees (/privacidad, linked from the portal) and «Eliminar caso».
 *
 * The notice describes how the product actually works. Bracketed placeholders (`[…]`) are facts only the business can
 * fill in (credIA's legal identity, contact, retention period); they stay until a data-protection
 * adviser has reviewed the text. Do not invent them.
 */

export const PRIVACY_NOTICE = {
  title: "Cómo se tratan los datos de tu empresa",
  updated: "Versión del 7 de octubre de 2026",
  intro:
    "Has recibido un enlace de una entidad de financiación (el prestamista) para que le envíes la documentación de tu empresa. Este texto explica qué datos se tratan, para qué, quién los ve y cómo ejercer tus derechos.",
  sections: [
    {
      heading: "Quién es responsable",
      body: [
        "El responsable del tratamiento es el prestamista que te envió el enlace: decide para qué se usan los datos y es a quien debes dirigirte para ejercer tus derechos.",
        "credIA ([RAZÓN SOCIAL Y CIF DE CREDIA]) presta el servicio por cuenta del prestamista, como encargado del tratamiento, y solo trata los datos siguiendo sus instrucciones.",
      ],
    },
    {
      heading: "Qué datos y para qué",
      body: [
        "Los documentos que subes o los datos que importas de Holded: contabilidad, extractos bancarios, informes CIRBE, impuestos, certificados, cuentas anuales e informes comerciales. También la información pública del Registro Mercantil (BORME) sobre la empresa.",
        "Se usan únicamente para preparar un paquete de datos con el que el prestamista estudia tu solicitud de financiación. credIA no puntúa a la empresa ni decide sobre la solicitud: la decisión es del prestamista.",
        "Algunos documentos contienen datos de personas (por ejemplo, nombres en movimientos bancarios o en nóminas). Se tratan solo como parte de esos documentos y con la misma finalidad.",
      ],
    },
    {
      heading: "Base legal",
      body: ["Tu consentimiento al usar el enlace y la aplicación de medidas precontractuales solicitadas por tu empresa. Puedes retirar el consentimiento en cualquier momento desde el propio enlace («Retirar consentimiento»)."],
    },
    {
      heading: "Quién accede",
      body: [
        "Solo el equipo del prestamista con acceso al caso. Ninguna otra entidad que use credIA puede ver tus datos.",
        "Para prestar el servicio, credIA utiliza estos proveedores, con contratos de encargo del tratamiento:",
      ],
      list: [
        "Supabase: base de datos y almacenamiento de archivos (Unión Europea, Irlanda).",
        "Vercel: alojamiento de la aplicación (Unión Europea).",
        "Anthropic (Estados Unidos): lectura automática de los PDF y asistente de análisis del prestamista. Recibe el contenido de los documentos para procesarlo, no lo usa para entrenar sus modelos y la transferencia se ampara en las cláusulas contractuales tipo de la Comisión Europea.",
        "Resend: envío de los correos con el enlace.",
      ],
    },
    {
      heading: "Cuánto tiempo",
      body: [
        "Mientras el prestamista estudia la solicitud y, como máximo, [PLAZO DE CONSERVACIÓN] después. El prestamista puede eliminar el caso antes; al hacerlo se borran todos los datos y archivos del caso.",
        "Si retiras el consentimiento, no se podrán subir más documentos; para que se borren los ya compartidos, pídeselo al prestamista.",
      ],
    },
    {
      heading: "Seguridad",
      body: [
        "Los datos viajan cifrados y cada prestamista solo puede acceder a sus propios casos. Las claves de Holded no se guardan salvo que elijas la sincronización periódica, y entonces se guardan cifradas. Cada consulta del prestamista a tus datos queda registrada.",
      ],
    },
    {
      heading: "Tus derechos",
      body: [
        "Puedes pedir acceso, rectificación, supresión, oposición, limitación o portabilidad de los datos al prestamista que te envió el enlace. También puedes escribir a credIA en [EMAIL DE PRIVACIDAD DE CREDIA] y lo trasladaremos al prestamista.",
        "Si no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).",
      ],
    },
  ],
} as const;

export const PRIVACY_LINK = "Cómo se tratan tus datos";

export const DELETE_CASE_COPY = {
  title: "Eliminar caso",
  hint: "Borra el caso, todos sus datos y sus archivos. Solo propietarios.",
  confirmTitle: (company: string) => `¿Eliminar el caso de ${company}?`,
  explain: "Se borrará para siempre, para todo el equipo:",
  whatGoes: [
    "Los documentos y archivos subidos, y los datos importados de Holded.",
    "Estados financieros, indicadores, verificaciones y movimientos bancarios.",
    "Enlaces de la empresa y de su gestoría, conversaciones y conclusiones.",
  ],
  notReversible: "No se puede deshacer. Solo queda una línea en el registro de auditoría con quién lo eliminó y cuándo.",
  typeCif: (cif: string) => `Escribe el CIF de la empresa (${cif}) para confirmar`,
  confirm: "Eliminar para siempre",
  deleting: "Eliminando…",
  failed: "No hemos podido eliminar el caso. Inténtalo de nuevo.",
} as const;
