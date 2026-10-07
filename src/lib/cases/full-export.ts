/**
 * «Descargar todo»: everything credIA holds for one case, as one zip, for access and portability requests (GDPR arts.
 * 15 and 20) and for handing a case back at the end of a pilot. Pure: names, layout and the README; the route
 * (`src/app/casos/[id]/exportar/todo/route.ts`) loads the data and the files.
 *
 * Layout:
 *   LEEME.txt                         what is inside and what is not
 *   caso.json                         the case as requested (company, contact, product, dates, consent)
 *   paquete.json                      the credit data package (same as the JSON export: figures with source_ref,
 *                                     checks, CIRBE, BORME, solvency report, analyst conclusions)
 *   documentos/<tipo>/<n>-<nombre>    every original file, as uploaded
 *   documentos.json                   index: document → its file in the zip, sha256, who uploaded it, status
 *   holded/<sync>.json                raw ledger lines imported from Holded
 *   movimientos-bancarios.json        bank movements as classified
 *   comunicaciones.json               links sent to the company and its gestoría (no tokens), the company's
 *                                     documentation-assistant chat and its requests to talk to a person
 *   registro-de-auditoria.json        who did and saw what on the case, and when
 *
 * Left out on purpose: the analysts' private «Preguntar al caso» threads (internal working notes; their conclusions
 * are in paquete.json) and anything that is not this case's.
 */
import { strToU8, zipSync, type Zippable } from "fflate";
import { DOC_KIND_LABEL } from "../../content/case-view.es.ts";

/** Zips are written here and handed out through a short signed URL (responses are capped well below a case's size). */
export const exportPrefix = (caseId: string) => `exports/${caseId}`;

/** A zip older than this is removed on the next export of the case and by the daily sweep. */
export const EXPORT_MAX_AGE_MS = 60 * 60 * 1000;

/** Above this the export is refused with a message (memory of one function, and Storage's upload limit). */
export const MAX_EXPORT_BYTES = 45 * 1024 * 1024;

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();

/** A file name safe inside a zip on any OS: no folders, no control characters, no leading dots, bounded length. */
export function safeName(name: string | null | undefined, fallback = "documento"): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/^\.+/, "").trim();
  return (clean || fallback).slice(0, 120);
}

export interface ExportDoc {
  id: string;
  kind: string;
  original_filename: string | null;
  storage_path: string;
}

/** Where each document goes in the zip: by kind, numbered in upload order so equal names never collide. */
export function documentEntries<T extends ExportDoc>(docs: readonly T[]): (T & { zipPath: string })[] {
  const counter = new Map<string, number>();
  return docs.map((d) => {
    const folder = slug(DOC_KIND_LABEL[d.kind] ?? d.kind) || "otros";
    const n = (counter.get(folder) ?? 0) + 1;
    counter.set(folder, n);
    const ext = /\.([a-z0-9]{1,5})$/i.exec(d.storage_path)?.[1]?.toLowerCase();
    let name = safeName(d.original_filename);
    if (ext && !name.toLowerCase().endsWith(`.${ext}`)) name = `${name}.${ext}`;
    return { ...d, zipPath: `documentos/${folder}/${String(n).padStart(2, "0")}-${name}` };
  });
}

/** Already-compressed formats are stored as they are; text formats are deflated. */
export const compressible = (path: string) => !/\.(pdf|xlsx|xls|zip|png|jpe?g)$/i.test(path);

export function exportFilename(caseRef: string, today: string) {
  return `credia-${caseRef}-completo-${today}.zip`;
}

/** Stale zips of a case (named `<epoch ms>-<id>.zip`) to remove before writing a new one. */
export function staleExports(names: readonly string[], now: number, maxAgeMs = EXPORT_MAX_AGE_MS): string[] {
  return names.filter((n) => {
    const at = Number(/^(\d{10,})-/.exec(n)?.[1]);
    return !Number.isFinite(at) || now - at > maxAgeMs;
  });
}

export function readme(o: {
  caseRef: string;
  companyName: string;
  cif: string;
  lenderName: string;
  generatedAt: string;
  generatedBy: string;
  files: number;
  missing: string[];
}): string {
  return [
    `credIA · ${o.caseRef} · ${o.companyName} (CIF ${o.cif})`,
    `Exportación completa generada el ${o.generatedAt} por ${o.generatedBy}, de ${o.lenderName}.`,
    "",
    "Contiene todo lo que credIA guarda de este caso:",
    "- caso.json: datos de la solicitud, contacto de la empresa y estado del consentimiento.",
    "- paquete.json: el paquete de datos (cifras con su origen, verificaciones, CIRBE, Registro Mercantil, informe de solvencia y conclusiones del analista).",
    `- documentos/: ${o.files === 1 ? "el archivo original tal como se subió" : `los ${o.files} archivos originales tal como se subieron`}; documentos.json dice cuál es cada uno.`,
    "- holded/: los apuntes importados de Holded, si los hay.",
    "- movimientos-bancarios.json: los movimientos bancarios leídos y su clasificación.",
    "- comunicaciones.json: enlaces enviados a la empresa y a su gestoría, conversación con el asistente de documentación y avisos a una persona.",
    "- registro-de-auditoria.json: quién hizo y consultó qué en el caso, y cuándo.",
    "",
    "No incluye las conversaciones privadas de los analistas con «Preguntar al caso» (notas internas de trabajo); sus conclusiones guardadas sí están en paquete.json.",
    ...(o.missing.length ? ["", `No se han podido incluir ${o.missing.length} archivo(s): ${o.missing.join(", ")}.`] : []),
    "",
    "credIA verifica y organiza la información; no puntúa ni recomienda. La decisión es del prestamista.",
    "",
  ].join("\n");
}

export interface ExportParts<D extends ExportDoc> {
  readme: Omit<Parameters<typeof readme>[0], "files" | "missing">;
  caso: unknown;
  paquete: unknown;
  /** Documents with their bytes (null: could not be read). */
  documents: (D & { bytes: Uint8Array | null })[];
  /** Holded raw ledgers: file name → bytes (null: could not be read). */
  holded: { name: string; bytes: Uint8Array | null }[];
  bank: unknown;
  communications: unknown;
  audit: unknown;
}

const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2));

/** The zip, and the entries that could not be included (named in LEEME.txt and documentos.json). */
export function assembleZip<D extends ExportDoc>(p: ExportParts<D>): { zip: Uint8Array; missing: string[] } {
  const files: Zippable = {};
  const missing: string[] = [];
  const entries = documentEntries(p.documents);
  for (const d of entries) {
    if (d.bytes) files[d.zipPath] = [d.bytes, { level: compressible(d.zipPath) ? 6 : 0 }];
    else missing.push(d.zipPath);
  }
  for (const h of p.holded) {
    const path = `holded/${safeName(h.name, "holded.json")}`;
    if (h.bytes) files[path] = [h.bytes, { level: 6 }];
    else missing.push(path);
  }
  files["LEEME.txt"] = strToU8(readme({ ...p.readme, files: entries.filter((d) => d.bytes).length, missing }));
  files["caso.json"] = json(p.caso);
  files["paquete.json"] = json(p.paquete);
  files["documentos.json"] = json(entries.map(({ bytes, storage_path: _s, ...d }) => ({ ...d, in_zip: bytes !== null })));
  files["movimientos-bancarios.json"] = json(p.bank);
  files["comunicaciones.json"] = json(p.communications);
  files["registro-de-auditoria.json"] = json(p.audit);
  return { zip: zipSync(files), missing };
}
