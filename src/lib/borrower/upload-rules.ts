/** What the borrower may upload for each requested document, and checks on the bytes received. Pure. */
import type { RequirementKind } from "../cases/requirements.ts";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Format = "pdf" | "xlsx" | "xls" | "text";

const EXTENSIONS: Record<string, Format> = {
  pdf: "pdf",
  xlsx: "xlsx",
  xls: "xls",
  csv: "text",
  txt: "text",
  n43: "text",
  q43: "text",
  aeb: "text",
};

export interface UploadRule {
  extensions: string[];
  multiple: boolean;
  /** Shown under the drop zone, e.g. ".n43, .txt, .aeb · varios ficheros a la vez". */
  acceptLabel: string;
}

const PDF_ONLY: UploadRule = { extensions: ["pdf"], multiple: false, acceptLabel: "PDF · hasta 20 MB" };

export const UPLOAD_RULES: Record<RequirementKind, UploadRule> = {
  trial_balance: { extensions: ["xlsx", "xls", "csv"], multiple: true, acceptLabel: ".xlsx, .xls, .csv · puedes subir varios ficheros" },
  // PDF statements are the fallback when the bank does not export Norma 43.
  norma43: { extensions: ["n43", "q43", "txt", "aeb", "pdf"], multiple: true, acceptLabel: ".n43, .txt, .aeb o PDF · varios ficheros a la vez" },
  modelo200: PDF_ONLY,
  cuentas_anuales: PDF_ONLY,
  cirbe: PDF_ONLY,
  aeat_cert: PDF_ONLY,
  tgss_cert: PDF_ONLY,
};

export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export type UploadCheck = { ok: true; ext: string } | { ok: false; message: string };

/** Checks the declared file before issuing an upload URL. Messages are borrower-facing Spanish. */
export function checkDeclaredFile(kind: RequirementKind, filename: string, size: number): UploadCheck {
  const rule = UPLOAD_RULES[kind];
  const ext = extensionOf(filename);
  if (!rule.extensions.includes(ext)) {
    return { ok: false, message: `«${filename}» no tiene un formato válido para este documento. Formatos aceptados: ${rule.extensions.map((e) => `.${e}`).join(", ")}.` };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: `«${filename}» está vacío.` };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, message: `«${filename}» ocupa más de 20 MB. Si es un PDF escaneado, prueba a exportarlo con menos resolución.` };
  return { ok: true, ext };
}

/** Checks that the bytes match the extension, so a renamed file is caught at upload rather than in processing. */
export function contentMatchesExtension(bytes: Uint8Array, ext: string): boolean {
  const format = EXTENSIONS[ext];
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (format) {
    case "pdf": {
      // "%PDF-" within the first 1 KB (some generators prepend a few bytes).
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
      return head.includes("%PDF-");
    }
    case "xlsx":
      return starts([0x50, 0x4b, 0x03, 0x04]); // ZIP container
    case "xls":
      return starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2 compound file
    case "text": {
      if (bytes.length === 0) return false;
      const sample = bytes.subarray(0, 8192);
      return !sample.includes(0); // binary files contain NUL bytes; Latin-1/UTF-8 text does not
    }
    default:
      return false;
  }
}

export const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  txt: "text/plain",
  n43: "text/plain",
  q43: "text/plain",
  aeb: "text/plain",
};

/** Storage key for an upload. The original filename is kept only in the documents row. */
export function uploadPath(caseId: string, kind: RequirementKind, uploadId: string, ext: string): string {
  return `cases/${caseId}/${kind}/${uploadId}.${ext}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Parses a path produced by `uploadPath` for this case; anything else is rejected. */
export function parseUploadPath(caseId: string, path: string): { kind: RequirementKind; ext: string } | null {
  const m = new RegExp(`^cases/(${UUID})/([a-z0-9_]+)/${UUID}\\.([a-z0-9]{1,5})$`).exec(path);
  if (!m || m[1] !== caseId) return null;
  const kind = m[2] as RequirementKind;
  if (!(kind in UPLOAD_RULES) || !UPLOAD_RULES[kind].extensions.includes(m[3])) return null;
  return { kind, ext: m[3] };
}

/** Display-safe filename: no path, no control characters, bounded length. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "documento").slice(0, 180);
}
