# Guía de documentos para el asistente

Texto de referencia del asistente de documentación. Lo que va entre corchetes, como [RUTA …], es un dato
pendiente de verificar: el asistente no debe repetirlo ni inventar un sustituto.

## Contabilidad (trial_balance)

**Qué es.** El balance de sumas y saldos: la lista de todas las cuentas contables de la empresa con sus
movimientos y saldos. Se pide el del último ejercicio cerrado y el del año en curso hasta hoy.

**Para qué se pide.** Para preparar el balance y la cuenta de resultados de la empresa a partir de su propia
contabilidad.

**Cómo conseguirlo.**
- Opción 1, Holded: en el portal, "Conectar Holded". En Holded, Configuración → Desarrolladores → API →
  Añadir token de API, con solo dos permisos de lectura: Contabilidad → Plan de cuentas y Contabilidad →
  Libro diario. Se pega la clave en el portal. La clave se usa una vez y no se guarda; después se puede
  borrar en Holded.
- Opción 2, fichero: en el programa de contabilidad (A3, Sage, Contasol, Holded, Odoo…) abrir el balance de
  sumas y saldos, exportarlo a Excel o CSV a nivel de subcuenta y subir dos ficheros: último ejercicio cerrado
  y año en curso.

**Si lo lleva la gestoría.** Es un informe estándar: cualquier gestoría puede exportarlo. Se le puede enviar
la petición desde el portal ("Enviar esta petición a mi gestoría").

## Movimientos bancarios (norma43)

**Qué es.** Los ficheros de movimientos de cada cuenta bancaria de la empresa en formato Norma 43 (también
llamado Cuaderno 43), de los últimos 12 meses.

**Para qué se pide.** Para contrastar los cobros y pagos reales con la contabilidad.

**Cómo conseguirlo.** Desde la banca online de empresas de cada banco, opción de descarga de movimientos en
formato Norma 43. Los pasos por banco están en la sección de bancos. Hace falta un fichero por cuenta; se
pueden subir varios a la vez. Se necesitan todas las cuentas de la empresa, también las de bancos online.

**Si el banco no exporta Norma 43.** Se pueden subir los extractos en PDF de los últimos 12 meses.

## Impuesto de Sociedades (modelo200)

**Qué es.** La declaración del Impuesto sobre Sociedades (Modelo 200) del último ejercicio, tal como se
presentó en la Agencia Tributaria.

**Para qué se pide.** Sirve como referencia oficial del ejercicio cerrado.

**Cómo conseguirlo.** En la sede electrónica de la Agencia Tributaria (sede.agenciatributaria.gob.es), en la página
del Modelo 200, opción «Consulta de declaraciones presentadas» (también en «Mis expedientes»). Identificación con
certificado electrónico o Cl@ve. Se indican el NIF de la empresa, el modelo y el ejercicio; el botón «Ver» abre la
copia de la declaración y el justificante, que se descargan en PDF.

**Si lo lleva la gestoría.** Normalmente la gestoría presentó la declaración y tiene el PDF.

## IVA trimestral (modelo303)

**Qué es.** Las autoliquidaciones de IVA (Modelo 303) de los últimos 4 trimestres ya presentados, tal como se
presentaron en la Agencia Tributaria. Un PDF por trimestre. Las empresas que declaran el IVA cada mes (gran
empresa, SII o REDEME) suben las declaraciones mensuales de esos 12 meses.

**Para qué se pide.** Muestra las ventas declaradas trimestre a trimestre, más recientes que el último ejercicio cerrado.

**Qué trimestres.** Los 4 últimos cuyo plazo de presentación ya ha terminado (el 20 del mes siguiente al trimestre;
el 30 de enero para el cuarto trimestre).

**Cómo conseguirlo.** Igual que el Modelo 200: sede electrónica de la Agencia Tributaria, página del Modelo 303,
«Consulta de declaraciones presentadas» (también en «Mis expedientes»). Se indican el NIF, el modelo, el ejercicio y,
opcionalmente, el periodo; «Ver» abre la copia de cada declaración en PDF.

**Si lo lleva la gestoría.** La gestoría tiene los justificantes de presentación de cada trimestre.

## Cuentas anuales (cuentas_anuales)

**Qué es.** Las cuentas anuales del último ejercicio (balance, cuenta de pérdidas y ganancias y memoria),
tal como se depositaron en el Registro Mercantil.

**Cómo conseguirlo.** Pedir el PDF a la gestoría, o solicitar el depósito de cuentas de la empresa en la sede
electrónica de los Registradores (sede.registradores.org).

## Informe CIRBE (cirbe)

**Qué es.** El informe de la Central de Información de Riesgos del Banco de España: lista los préstamos,
créditos y avales de la empresa declarados por las entidades financieras. Es gratuito.

**Para qué se pide.** Para conocer la financiación que la empresa tiene con otras entidades.

**Cómo conseguirlo.** En la sede electrónica del Banco de España (sedeelectronica.bde.es), trámite «Informe de
riesgos de la Central de Información de Riesgos», con un certificado electrónico. Desde septiembre de 2023 las
empresas tienen que pedirlo por vía electrónica. El informe suele estar disponible en unos 15 minutos, solo lo puede
descargar quien lo pidió y se puede descargar durante 20 días.

**Sin certificado digital.** La gestoría puede pedirlo si tiene apoderamiento o el certificado de la empresa.

## Certificado de Hacienda (aeat_cert)

**Qué es.** Certificado de la Agencia Tributaria de que la empresa está al corriente de sus obligaciones
tributarias.

**Cómo conseguirlo.** En la sede electrónica de la Agencia Tributaria: «Todas las gestiones» → «Certificados» →
«Situación tributaria». Identificación con certificado electrónico, DNI electrónico o Cl@ve Móvil. Si el resultado
es positivo, el certificado se obtiene en el momento. Descargar el PDF. La fecha de emisión se lee del documento; en el portal se puede indicar también, pero no es obligatorio.

**Antigüedad.** La entidad puede exigir que sea reciente; la regla concreta de este caso figura en la lista de
documentos.

## Certificado de la Seguridad Social (tgss_cert)

**Qué es.** Certificado de la Tesorería General de la Seguridad Social de que la empresa está al corriente de
pago.

**Cómo conseguirlo.** En la sede electrónica de la Seguridad Social (sede.seg-social.gob.es): «Empresas y
Profesionales» → «Informes y Certificados» → certificado de estar al corriente, con el certificado electrónico de la
empresa. Se puede pedir un certificado genérico o para un fin concreto (subvenciones, contratación pública…). Descargar el PDF. La fecha de emisión se lee del documento; en el portal se puede indicar también, pero no es obligatorio.

**Antigüedad.** La entidad puede exigir que sea reciente; la regla concreta de este caso figura en la lista de
documentos. Si el portal marca el certificado como antiguo, hay que pedir uno nuevo y subirlo.

## Informe de solvencia (solvency_report)

**Qué es.** Un informe comercial de la empresa elaborado por un proveedor de información (Experian, Informa,
Axesor, Iberinform u otro): datos registrales, incidencias de pago, incidencias judiciales y cifras de las
cuentas depositadas.

**Para qué se pide.** Para que la entidad conozca las incidencias de pago y judiciales de la empresa sin
pedírselas una a una.

**Cómo conseguirlo.** Se pide al proveedor de información comercial; cada proveedor tiene su propio servicio y
esta guía no detalla sus pasos. Hay que subir el informe completo en PDF, tal como lo entrega el proveedor, no un resumen ni una
captura. Cualquier proveedor vale salvo que la entidad indique otra cosa. La fecha del informe se lee del documento.

**Coste.** Los proveedores suelen cobrar por el informe. Si la empresa no quiere pedirlo, puede decirlo con
"Hablar con una persona": a veces la propia entidad lo obtiene.

**Antigüedad.** La entidad puede exigir que sea reciente; la regla de este caso figura en la lista.

## Uso del portal

- Cada documento es un paso de la lista. Se sube arrastrando el fichero al recuadro o pulsando "selecciónalo".
- Tamaño máximo por fichero: 20 MB.
- El progreso se guarda solo. Se puede salir y volver con el mismo enlace.
- "Enviar documentación" se activa cuando están todos los documentos obligatorios.
- "Enviar esta petición a mi gestoría" crea un enlace propio para la gestoría, solo para esta solicitud.
- "Retirar consentimiento" (en "Qué compartimos y con quién") detiene el envío de documentación.
- "Hablar con una persona" avisa a la entidad para que contacte con la empresa.
