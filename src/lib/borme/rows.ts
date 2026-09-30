/** Parsed Section A entries → `borme_acts` rows (one per act). Pure. */
import { companyKey } from "./names.ts";
import type { BormeEntry } from "./parse.ts";
import type { StoredAct } from "./profile.ts";

export interface ActRow extends StoredAct {
  company_norm: string;
  pdf_url: string;
}

export function toActRows(entries: BormeEntry[], meta: { publishedOn: string; bormeId: string; province: string; pdfUrl: string }): ActRow[] {
  return entries.flatMap((e) =>
    e.acts.map((a, i) => ({
      published_on: meta.publishedOn,
      borme_id: meta.bormeId,
      province: meta.province,
      pdf_url: meta.pdfUrl,
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
