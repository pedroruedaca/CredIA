/**
 * BORME for one case: candidate companies (by name), the lender's confirmed match, the confirmed company's profile
 * and its checks. Works with the lender's RLS client (case view) or the service role (pipeline); borme_acts and
 * borme_days are readable by any signed-in user, case_borme_matches only by the case's lender.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckResult } from "../checks/engine.ts";
import { companyKey } from "./names.ts";
import { bormeChecks, buildProfile, type CompanyProfile, type StoredAct } from "./profile.ts";

const ACT_COLUMNS = "published_on, borme_id, province, entry_number, company_name, registry_sheet, registered_on, act_index, act_type, act_label, act_text, details";

export interface BormeCandidate {
  sheet: string;
  name: string;
  province: string;
  acts: number;
  firstSeen: string;
  lastSeen: string;
}

export interface CaseRegistry {
  /** BORME days imported, or null when nothing has been imported yet. */
  coverage: { from: string; to: string } | null;
  match: { status: "confirmed" | "none"; sheet: string | null; decidedAt: string } | null;
  candidates: BormeCandidate[];
  profile: CompanyProfile | null;
}

export async function bormeCoverage(db: SupabaseClient): Promise<CaseRegistry["coverage"]> {
  const [first, last] = await Promise.all([
    db.from("borme_days").select("day").eq("status", "ingested").order("day", { ascending: true }).limit(1).maybeSingle(),
    db.from("borme_days").select("day").eq("status", "ingested").order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return first.data && last.data ? { from: first.data.day, to: last.data.day } : null;
}

export async function actsForSheet(db: SupabaseClient, sheet: string): Promise<StoredAct[]> {
  const { data } = await db.from("borme_acts").select(ACT_COLUMNS).eq("registry_sheet", sheet).order("published_on").limit(2000);
  return (data ?? []) as StoredAct[];
}

/** Registry sheets whose announcements carry this company name (any spelling of the legal form). */
export async function findCandidates(db: SupabaseClient, companyName: string): Promise<BormeCandidate[]> {
  const key = companyKey(companyName);
  if (key.length < 3) return [];
  const { data } = await db.from("borme_acts").select("registry_sheet, company_name, province, published_on, registered_on").eq("company_norm", key).not("registry_sheet", "is", null).limit(2000);
  const bySheet = new Map<string, BormeCandidate>();
  for (const r of data ?? []) {
    const date = r.registered_on ?? r.published_on;
    const c = bySheet.get(r.registry_sheet!);
    if (!c) bySheet.set(r.registry_sheet!, { sheet: r.registry_sheet!, name: r.company_name, province: r.province, acts: 1, firstSeen: date, lastSeen: date });
    else {
      c.acts++;
      if (date < c.firstSeen) c.firstSeen = date;
      if (date >= c.lastSeen) Object.assign(c, { lastSeen: date, name: r.company_name, province: r.province });
    }
  }
  return [...bySheet.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function loadCaseRegistry(db: SupabaseClient, caseId: string, companyName: string | null): Promise<CaseRegistry> {
  const [coverage, match] = await Promise.all([
    bormeCoverage(db),
    db.from("case_borme_matches").select("status, registry_sheet, decided_at").eq("case_id", caseId).maybeSingle(),
  ]);
  const m = match.data ? { status: match.data.status as "confirmed" | "none", sheet: match.data.registry_sheet as string | null, decidedAt: match.data.decided_at as string } : null;
  const [candidates, acts] = await Promise.all([
    companyName && coverage ? findCandidates(db, companyName) : Promise.resolve([]),
    m?.status === "confirmed" && m.sheet ? actsForSheet(db, m.sheet) : Promise.resolve([]),
  ]);
  return { coverage, match: m, candidates, profile: buildProfile(acts) };
}

/** Checks for the pipeline: only once the lender has confirmed which company it is. */
export async function caseBormeChecks(db: SupabaseClient, caseId: string, today: string): Promise<CheckResult[]> {
  const { data: match } = await db.from("case_borme_matches").select("status, registry_sheet").eq("case_id", caseId).maybeSingle();
  if (match?.status !== "confirmed" || !match.registry_sheet) return [];
  const [acts, coverage] = await Promise.all([actsForSheet(db, match.registry_sheet), bormeCoverage(db)]);
  return bormeChecks(acts, { today, coverageStart: coverage?.from ?? null });
}
