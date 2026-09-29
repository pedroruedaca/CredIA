/**
 * Borrower upload validation. Pure: the route passes the file's name, size and first bytes.
 * Extension and content must agree (magic-byte sniffing) so a renamed executable is not stored as a PDF.
 */
import type { RequirementKind } from "../cases/requirements.ts";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Format = "pdf" | "xlsx" | "xls" | "csv" | "n43";

const EXTENSIONS: Record<string, Format> = {
  pdf: "pdf",
  xlsx: "xlsx",
  xls: "xls",
  csv: "csv",
  n43: "n43",
  txt: "n43",
  aeb: "n43",
  q43: "n43",
  c43: "n43",
};

const ALLOWED: Record<RequirementKind, Format[]> = {
  trial_balance: ["xlsx", "xls", "csv"],
  norma43: ["n43", "pdf"], // PDF statements are the fallback when a bank doesn't export Norma 43
  modelo200: ["pdf"],
  cuentas_anuales: ["pdf"],
  cirbe: ["pdf"],
  aeat_cert: ["pdf"],
  tgss_cert: ["pdf"],
};

const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  n43: "text/plain",
};

export type UploadCheck =
  | { ok: true; format: Format; mimeType: string; safeName: string }
  | { ok: false; message: string };

function startsWith(head: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => head[i] === b);
}

/** Printable text (ASCII / Latin-1 / UTF-8) with no NUL bytes. */
function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  let control = 0;
  for (const b of head) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / head.length < 0.01;
}

function sniff(format: Format, head: Uint8Array): boolean {
  switch (format) {
    case "pdf":
      return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "xlsx":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]); // ZIP
    case "xls":
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
    case "csv":
      return looksLikeText(head);
    case "n43": {
      // Norma 43 files open with a header record "11"; some banks prepend a UTF-8 BOM.
      const body = startsWith(head, [0xef, 0xbb, 0xbf]) ? head.subarray(3) : head;
      return looksLikeText(body) && body[0] === 0x31 && body[1] === 0x31;
    }
  }
}

/** Storage-safe file name: no path, ASCII only, bounded length. Keeps the extension. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fichero";
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return cleaned || "fichero";
}

const humanList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} o ${xs.at(-1)}`);

/** Name and size only: used before the bytes exist (to issue an upload URL). */
export function checkUploadMeta(kind: RequirementKind, name: string, size: number): UploadCheck {
  if (size === 0) return { ok: false, message: "El fichero está vacío." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, message: "El fichero supera los 20 MB. Si es un PDF escaneado, prueba a exportarlo con menos resolución." };

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const format = EXTENSIONS[ext];
  const allowed = ALLOWED[kind];
  if (!format || !allowed.includes(format)) {
    const exts = Object.entries(EXTENSIONS).filter(([, f]) => allowed.includes(f)).map(([e]) => `.${e}`);
    return { ok: false, message: `Este documento debe ser ${humanList(exts)}.` };
  }
  return { ok: true, format, mimeType: MIME[format], safeName: safeFileName(name) };
}

/** Full check once the bytes are available: metadata plus magic-byte sniffing of the first bytes. */
export function checkUpload(kind: RequirementKind, name: string, size: number, head: Uint8Array): UploadCheck {
  const meta = checkUploadMeta(kind, name, size);
  if (!meta.ok) return meta;
  const { format } = meta;
  if (!sniff(format, head)) {
    return {
      ok: false,
      message: format === "n43"
        ? "El fichero no parece un Norma 43. Descárgalo de nuevo eligiendo el formato Norma 43 / Cuaderno 43."
        : "El contenido del fichero no coincide con su extensión. Descárgalo de nuevo y vuelve a subirlo.",
    };
  }
  return meta;
}
