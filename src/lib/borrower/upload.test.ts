import { describe, expect, it } from "vitest";
import { checkUpload, MAX_UPLOAD_BYTES, safeFileName } from "./upload.ts";

const bytes = (s: string | number[]) => (typeof s === "string" ? new TextEncoder().encode(s) : new Uint8Array(s));
const PDF = bytes("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const XLSX = bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const XLS = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const N43 = bytes("11004912340000123456260101260331000000001234567800000000000000EUR300000000000000\r\n22");

describe("checkUpload", () => {
  it("accepts a PDF certificate and reports its MIME type", () => {
    expect(checkUpload("tgss_cert", "certificado.pdf", 120_000, PDF)).toMatchObject({ ok: true, format: "pdf", mimeType: "application/pdf" });
  });
  it("accepts trial balances as xlsx, xls or csv", () => {
    expect(checkUpload("trial_balance", "sys.XLSX", 5_000, XLSX).ok).toBe(true);
    expect(checkUpload("trial_balance", "sys.xls", 5_000, XLS).ok).toBe(true);
    expect(checkUpload("trial_balance", "sys.csv", 5_000, bytes("Cuenta;Descripción;Debe;Haber\n43000001;Cliente;1.234,56;0\n")).ok).toBe(true);
  });
  it("accepts Norma 43 with or without BOM, and PDF statements as fallback", () => {
    expect(checkUpload("norma43", "cuenta1.n43", 2_000, N43).ok).toBe(true);
    expect(checkUpload("norma43", "cuenta1.txt", 2_000, new Uint8Array([0xef, 0xbb, 0xbf, ...N43])).ok).toBe(true);
    expect(checkUpload("norma43", "extracto.pdf", 2_000, PDF).ok).toBe(true);
  });
  it("rejects a text file that is not Norma 43 with a specific message", () => {
    const r = checkUpload("norma43", "movimientos.txt", 2_000, bytes("Fecha;Concepto;Importe\n"));
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/no parece un Norma 43/) });
  });
  it("rejects the wrong extension for the document, listing what is accepted", () => {
    const r = checkUpload("cirbe", "cirbe.xlsx", 2_000, XLSX);
    expect(r).toEqual({ ok: false, message: "Este documento debe ser .pdf." });
    const tb = checkUpload("trial_balance", "balance.pdf", 2_000, PDF);
    expect(tb).toEqual({ ok: false, message: "Este documento debe ser .xlsx, .xls o .csv." });
  });
  it("rejects content that does not match the extension", () => {
    expect(checkUpload("modelo200", "modelo200.pdf", 2_000, bytes([0x4d, 0x5a, 0x90, 0x00])).ok).toBe(false); // PE executable
    expect(checkUpload("trial_balance", "balance.csv", 2_000, bytes([0x00, 0x01, 0x02])).ok).toBe(false);
  });
  it("rejects empty and oversized files", () => {
    expect(checkUpload("cirbe", "a.pdf", 0, PDF)).toEqual({ ok: false, message: "El fichero está vacío." });
    expect(checkUpload("cirbe", "a.pdf", MAX_UPLOAD_BYTES + 1, PDF).ok).toBe(false);
    expect(checkUpload("cirbe", "a.pdf", MAX_UPLOAD_BYTES, PDF).ok).toBe(true);
  });
});

describe("safeFileName", () => {
  it("strips paths, accents and unsafe characters but keeps the extension", () => {
    expect(safeFileName("../../etc/Certificado Seg. Social (marzo).pdf")).toBe("Certificado_Seg._Social_marzo_.pdf");
    expect(safeFileName("C:\\Users\\ana\\Declaración 200.pdf")).toBe("Declaracion_200.pdf");
    expect(safeFileName(".htaccess")).toBe("htaccess");
    expect(safeFileName("///")).toBe("fichero");
  });
});
