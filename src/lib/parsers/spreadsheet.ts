/**
 * Reads uploaded spreadsheets into plain cell arrays for the parsers. CSV is read here (Spanish exports use ";"
 * and Windows-1252); .xlsx goes through exceljs. Numbers stay as the file wrote them: parsers use toNumber().
 */
import ExcelJS from "exceljs";
import type { SheetData } from "./trial-balance.ts";

const MAX_ROWS = 50_000;

/** UTF-8 when valid, otherwise Windows-1252 (what A3/Sage/Contasol write on Spanish Windows). */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const count = (d: string) => {
    let n = 0;
    let quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    return n;
  };
  return [";", "\t", ",", "|"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC 4180-style CSV with auto-detected delimiter; quoted fields may contain delimiters and newlines. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length >= MAX_ROWS) return rows;
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || v instanceof Date) return v;
  if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null; // formulas: cached result
  if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
  if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
  if ("error" in v) return null;
  return null;
}

export async function readXlsx(bytes: Uint8Array): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > MAX_ROWS) return;
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows[n - 1] = values.map((v) => cellValue(v as ExcelJS.CellValue));
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}

export async function readSpreadsheet(bytes: Uint8Array, ext: string): Promise<SheetData[]> {
  if (ext === "xlsx") return readXlsx(bytes);
  return [{ name: "csv", rows: parseCsv(decodeText(bytes)) }];
}
