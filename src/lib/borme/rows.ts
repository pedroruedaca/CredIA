/**
 * Parsed Section A entries → rows: `borme_index` (one per announcement: where it is and whose it is),
 * `borme_pdfs` (one per provincial PDF) and full acts (`borme_company_acts`, only for confirmed companies). Pure.
 */
import { companyKey } from "./names.ts";
import type { BormeEntry } from "./parse.ts";
import type { StoredAct } from "./profile.ts";

export interface PdfMeta {
  publishedOn: string;
  bormeId: string;
  province: string;
}

/** A full act as parsed, with the company key (used by tests and the importer). */
export interface ActRow extends StoredAct {
  company_norm: string;
}

export interface IndexRow {
  published_on: string;
  seq: number;
  entry_number: number;
  company_norm: string;
  registry_sheet: string | null;
}

/** "BORME-A-2026-185-46" → issue 185, seq 46. */
export function pdfParts(bormeId: string): { year: number; issue: number; seq: number } {
  const [, , year, issue, seq] = bormeId.split("-");
  return { year: Number(year), issue: Number(issue), seq: Number(seq) };
}

/** "BORME-A-" + year + issue + two-digit provincial sequence, as BOE names the PDFs. */
export const bormeIdOf = (year: number, issue: number, seq: number) => `BORME-A-${year}-${issue}-${String(seq).padStart(2, "0")}`;

export function toActRows(entries: BormeEntry[], meta: PdfMeta): ActRow[] {
  return entries.flatMap((e) =>
    e.acts.map((a, i) => ({
      published_on: meta.publishedOn,
      borme_id: meta.bormeId,
      province: meta.province,
      entry_number: e.number,
      company_name: e.company,
      company_norm: companyKey(e.company),
      registry_sheet: e.registry?.sheet ?? null,
      registered_on: e.registeredOn,
      act_index: i,
      act_type: a.type,
      act_label: a.label,
      act_text: a.text,
      details: a.details,
    })),
  );
}

export function toIndexRows(entries: BormeEntry[], meta: PdfMeta): IndexRow[] {
  const { seq } = pdfParts(meta.bormeId);
  return entries.map((e) => ({ published_on: meta.publishedOn, seq, entry_number: e.number, company_norm: companyKey(e.company), registry_sheet: e.registry?.sheet ?? null }));
}

/** Acts to store in `borme_company_acts` (without the company key column). */
export const toCompanyActs = (rows: ActRow[]): StoredAct[] => rows.filter((r) => r.registry_sheet).map(({ company_norm: _k, ...a }) => a);
