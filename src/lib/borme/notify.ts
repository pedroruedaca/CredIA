/** Which cases have new BORME acts, grouped per case. Pure. */
import type { Severity } from "../checks/engine.ts";
import { bormeRef, SEVERITY, type StoredAct } from "./profile.ts";

export interface NewActs {
  caseId: string;
  lenderId: string;
  sheet: string;
  acts: { date: string; type: string; label: string; severity: Severity | null; source: string }[];
}

export function newActsByCase(matches: { caseId: string; lenderId: string; sheet: string }[], acts: StoredAct[]): NewActs[] {
  const bySheet = new Map<string, StoredAct[]>();
  for (const a of acts) if (a.registry_sheet) bySheet.set(a.registry_sheet, [...(bySheet.get(a.registry_sheet) ?? []), a]);
  return matches.flatMap((m) => {
    const list = bySheet.get(m.sheet);
    if (!list?.length) return [];
    const sorted = [...list].sort((a, b) => a.published_on.localeCompare(b.published_on) || a.entry_number - b.entry_number || a.act_index - b.act_index);
    return [{ ...m, acts: sorted.map((a) => ({ date: a.registered_on ?? a.published_on, type: a.act_type, label: a.act_label, severity: SEVERITY[a.act_type] ?? null, source: bormeRef(a) })) }];
  });
}
