/**
 * After the daily import: cases whose confirmed company has new BORME acts get a system event
 * (`borme.new_acts`, shown in the Bandeja until someone opens the case) and are reprocessed so their BORME checks
 * reflect the new acts. Only days inside the job's window and not yet notified count, so the backfill never
 * alerts about old acts. Server-only (service role).
 */
import "server-only";
import type { AdminClient } from "../borrower/access.ts";
import { processCase } from "../pipeline/process-case.ts";
import type { ActType } from "./parse.ts";
import type { StoredAct } from "./profile.ts";
import { newActsByCase } from "./notify.ts";

const COLUMNS = "published_on, borme_id, province, entry_number, company_name, registry_sheet, registered_on, act_index, act_type, act_label, act_text, details";

export async function notifyNewActs(db: AdminClient, fromDay: string): Promise<{ days: string[]; cases: number }> {
  const { data: days } = await db.from("borme_days").select("day").eq("status", "ingested").is("notified_at", null).gte("day", fromDay);
  const dayList = (days ?? []).map((d) => d.day as string);
  if (!dayList.length) return { days: [], cases: 0 };

  const { data: matches } = await db
    .from("case_borme_matches")
    .select("case_id, lender_id, registry_sheet, cases(status)")
    .eq("status", "confirmed");
  const open = (matches ?? []).filter((m) => (m.cases as unknown as { status: string } | null)?.status !== "archived" && m.registry_sheet);
  let notified = 0;
  if (open.length) {
    const sheets = [...new Set(open.map((m) => m.registry_sheet as string))];
    const acts: StoredAct[] = [];
    for (let i = 0; i < sheets.length; i += 200) {
      const { data } = await db.from("borme_acts").select(COLUMNS).in("published_on", dayList).in("registry_sheet", sheets.slice(i, i + 200));
      acts.push(...((data ?? []) as StoredAct[]));
    }
    const byCase = newActsByCase(open.map((m) => ({ caseId: m.case_id, lenderId: m.lender_id, sheet: m.registry_sheet as string })), acts);
    for (const n of byCase) {
      await db.from("audit_log").insert({
        lender_id: n.lenderId,
        case_id: n.caseId,
        actor: "system",
        action: "borme.new_acts",
        detail: { registry_sheet: n.sheet, acts: n.acts.map((a) => ({ date: a.date, type: a.type as ActType, label: a.label, severity: a.severity, source_ref: a.source })) },
      });
      await processCase(db, n.caseId);
      notified++;
    }
  }
  await db.from("borme_days").update({ notified_at: new Date().toISOString() }).in("day", dayList);
  return { days: dayList, cases: notified };
}

