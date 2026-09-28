import { describe, expect, it } from "vitest";
import { checkDeclaredFile, cleanFilename, contentMatchesExtension, MAX_UPLOAD_BYTES, parseUploadPath, uploadPath } from "./upload-rules.ts";

const CASE = "3f2a91c0-1111-4222-8333-444455556666";
const UPLOAD = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const bytes = (s: string) => new TextEncoder().encode(s);

describe("checkDeclaredFile", () => {
  it("accepts the formats each document allows", () => {
    expect(checkDeclaredFile("trial_balance", "Sumas y saldos 2025.XLSX", 1000)).toEqual({ ok: true, ext: "xlsx" });
    expect(checkDeclaredFile("norma43", "cuenta_1.n43", 1000)).toEqual({ ok: true, ext: "n43" });
    expect(checkDeclaredFile("norma43", "extracto.pdf", 1000)).toEqual({ ok: true, ext: "pdf" });
    expect(checkDeclaredFile("cirbe", "cirbe.pdf", 1000)).toEqual({ ok: true, ext: "pdf" });
  });
  it("rejects other formats with a Spanish message listing what is accepted", () => {
    const r = checkDeclaredFile("cirbe", "cirbe.docx", 1000);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("Formatos aceptados: .pdf");
    expect(checkDeclaredFile("trial_balance", "sin_extension", 1000).ok).toBe(false);
  });
  it("enforces the 20 MB limit and rejects empty files", () => {
    expect(checkDeclaredFile("cirbe", "a.pdf", MAX_UPLOAD_BYTES).ok).toBe(true);
    expect(checkDeclaredFile("cirbe", "a.pdf", MAX_UPLOAD_BYTES + 1).ok).toBe(false);
    expect(checkDeclaredFile("cirbe", "a.pdf", 0).ok).toBe(false);
  });
});

describe("contentMatchesExtension", () => {
  it("recognises PDF, XLSX and XLS signatures", () => {
    expect(contentMatchesExtension(bytes("%PDF-1.7\n..."), "pdf")).toBe(true);
    expect(contentMatchesExtension(bytes("\r\n%PDF-1.4"), "pdf")).toBe(true);
    expect(contentMatchesExtension(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]), "xlsx")).toBe(true);
    expect(contentMatchesExtension(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "xls")).toBe(true);
  });
  it("catches renamed files", () => {
    expect(contentMatchesExtension(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "pdf")).toBe(false);
    expect(contentMatchesExtension(bytes("%PDF-1.7"), "xlsx")).toBe(false);
    expect(contentMatchesExtension(new Uint8Array([0x25, 0x50, 0x00, 0x46]), "n43")).toBe(false);
  });
  it("accepts Norma 43 text, including Latin-1 bytes", () => {
    const n43 = "1100491234567890123420260101202603312000000001234567897800000000000000EMPRESA EJEMPLO SL  \r\n";
    expect(contentMatchesExtension(bytes(n43), "n43")).toBe(true);
    expect(contentMatchesExtension(new Uint8Array([0x32, 0x32, 0xd1, 0x0d, 0x0a]), "txt")).toBe(true); // "22Ñ" in Latin-1
    expect(contentMatchesExtension(new Uint8Array(), "txt")).toBe(false);
  });
});

describe("upload paths", () => {
  it("round-trips a path for this case", () => {
    const p = uploadPath(CASE, "norma43", UPLOAD, "n43");
    expect(p).toBe(`cases/${CASE}/norma43/${UPLOAD}.n43`);
    expect(parseUploadPath(CASE, p)).toEqual({ kind: "norma43", ext: "n43" });
  });
  it("rejects paths of another case, traversal, unknown kinds or disallowed extensions", () => {
    const other = "00000000-0000-4000-8000-000000000000";
    expect(parseUploadPath(CASE, uploadPath(other, "cirbe", UPLOAD, "pdf"))).toBeNull();
    expect(parseUploadPath(CASE, `cases/${CASE}/../${other}/cirbe/${UPLOAD}.pdf`)).toBeNull();
    expect(parseUploadPath(CASE, `cases/${CASE}/other/${UPLOAD}.pdf`)).toBeNull();
    expect(parseUploadPath(CASE, `cases/${CASE}/cirbe/${UPLOAD}.xlsx`)).toBeNull();
    expect(parseUploadPath(CASE, `raw/holded/${CASE}/${UPLOAD}.json`)).toBeNull();
  });
});

describe("cleanFilename", () => {
  it("drops directories and control characters", () => {
    expect(cleanFilename("C:\\Users\\ana\\Escritorio\\cirbe.pdf")).toBe("cirbe.pdf");
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("a\u0000b\n.pdf")).toBe("ab.pdf");
    expect(cleanFilename("   ")).toBe("documento");
  });
});
