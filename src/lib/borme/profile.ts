/**
 * A company's registry history, from the BORME acts stored for its registry sheet: current officers, capital
 * history, a timeline, and the checks the lender sees (insolvency, dissolution, closed sheet, capital reduction,
 * officer turnover, recent address change, recent incorporation). Pure. Flags facts; never scores.
 */
import type { CheckResult, Severity } from "../checks/engine.ts";
import type { ActDetails, ActType } from "./parse.ts";

/** One row of `borme_acts`. */
export interface StoredAct {
  published_on: string;
  borme_id: string;
  province: string;
  entry_number: number;
  company_name: string;
  registry_sheet: string | null;
  registered_on: string | null;
  act_index: number;
  act_type: ActType;
  act_label: string;
  act_text: string;
  details: ActDetails;
}

/** source_ref of a BORME announcement: borme:<published date>:<PDF id>:entry:<number>. */
export const bormeRef = (a: Pick<StoredAct, "published_on" | "borme_id" | "entry_number">) => `borme:${a.published_on}:${a.borme_id}:entry:${a.entry_number}`;

export interface TimelineItem {
  date: string;
  type: ActType;
  label: string;
  text: string;
  source: string;
  severity: Severity | null;
}

export interface CompanyProfile {
  sheet: string;
  name: string;
  /** Earlier names under the same sheet, most recent first. */
  formerNames: string[];
  province: string;
  constitutedOn: string | null;
  /** Share capital after the latest act that states it, and when. */
  capital: { amount: number; date: string } | null;
  officers: { role: string; name: string; since: string | null }[];
  capitalHistory: { date: string; type: ActType; amount: number | null; capital: number | null; source: string }[];
  timeline: TimelineItem[];
  /** First and last BORME dates with acts for this company. */
  firstSeen: string;
  lastSeen: string;
}

const ADMIN_ROLE = /^(adm|consej|con\.?\s?del|cons\.|president|vicepres|liquidador)/i;
const isAdminRole = (role: string) => ADMIN_ROLE.test(role) && !/concursal/i.test(role);

const actDate = (a: StoredAct) => a.registered_on ?? a.published_on;
const order = (a: StoredAct, b: StoredAct) =>
  actDate(a).localeCompare(actDate(b)) || a.published_on.localeCompare(b.published_on) || a.entry_number - b.entry_number || a.act_index - b.act_index;

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} €`;

const SEVERITY: Partial<Record<ActType, Severity>> = {
  insolvency: "high",
  dissolution: "high",
  extinction: "high",
  sheet_closed: "high",
  capital_reduction: "warn",
};

export function buildProfile(acts: StoredAct[]): CompanyProfile | null {
  const sorted = acts.filter((a) => a.registry_sheet).sort(order);
  if (!sorted.length) return null;
  const last = sorted[sorted.length - 1];

  const names: string[] = [];
  for (const a of [...sorted].reverse()) if (!names.includes(a.company_name)) names.push(a.company_name);

  const officers = new Map<string, { role: string; name: string; since: string | null }>();
  const key = (o: { role: string; name: string }) => `${o.role}|${o.name}`;
  const capitalHistory: CompanyProfile["capitalHistory"] = [];
  let constitutedOn: string | null = null;

  for (const a of sorted) {
    const date = actDate(a);
    const listed = a.details.officers ?? [];
    switch (a.act_type) {
      case "constitution":
        constitutedOn ??= date;
        if (a.details.capital !== undefined) capitalHistory.push({ date, type: a.act_type, amount: a.details.capital, capital: a.details.capital, source: bormeRef(a) });
        break;
      case "appointments":
      case "reelections":
        for (const o of listed) if (!officers.has(key(o))) officers.set(key(o), { ...o, since: date });
        break;
      case "cessations":
      case "revocations":
        for (const o of listed) {
          if (officers.delete(key(o))) continue;
          // Same person listed under a differently abbreviated role: remove by name.
          for (const [k, v] of officers) if (v.name === o.name && isAdminRole(v.role) === isAdminRole(o.role)) officers.delete(k);
        }
        break;
      case "officers_cancelled":
        if (listed.length) for (const o of listed) officers.delete(key(o));
        else officers.clear();
        break;
      case "extinction":
        officers.clear();
        break;
      case "capital_increase":
      case "capital_reduction":
        capitalHistory.push({ date, type: a.act_type, amount: a.details.amount ?? null, capital: a.details.capital ?? null, source: bormeRef(a) });
        break;
      default:
        break;
    }
  }

  const withCapital = capitalHistory.filter((c) => c.capital !== null);
  const latestCapital = withCapital[withCapital.length - 1];
  return {
    sheet: last.registry_sheet!,
    name: names[0],
    formerNames: names.slice(1),
    province: last.province,
    constitutedOn,
    capital: latestCapital ? { amount: latestCapital.capital!, date: latestCapital.date } : null,
    officers: [...officers.values()].sort((a, b) => Number(isAdminRole(b.role)) - Number(isAdminRole(a.role)) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    capitalHistory: capitalHistory.reverse(),
    timeline: [...sorted].reverse().map((a) => ({ date: actDate(a), type: a.act_type, label: a.act_label, text: a.act_text, source: bormeRef(a), severity: SEVERITY[a.act_type] ?? null })),
    firstSeen: actDate(sorted[0]),
    lastSeen: actDate(last),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Checks

/**
 * Checks from the registry history. `coverageStart` is the first BORME day imported: the history (and so "no
 * adverse acts") only covers from then on, and the messages say so.
 */
export function bormeChecks(acts: StoredAct[], opts: { today: string; coverageStart: string | null }): CheckResult[] {
  const profile = buildProfile(acts);
  if (!profile) return [];
  const sorted = acts.filter((a) => a.registry_sheet).sort(order);
  const since = opts.coverageStart ? ` (BORME revisado desde ${fmt(opts.coverageStart)})` : "";
  const base = { sheet: profile.sheet };
  const out: CheckResult[] = [];
  const lastOf = (...types: ActType[]) => [...sorted].reverse().find((a) => types.includes(a.act_type)) ?? null;
  const after = (a: StoredAct | null, b: StoredAct | null) => !!a && (!b || order(a, b) > 0);

  const insolvency = sorted.filter((a) => a.act_type === "insolvency");
  if (insolvency.length) {
    const l = insolvency[insolvency.length - 1];
    out.push({
      key: "borme_insolvency",
      status: "fail",
      severity: "high",
      message: `El BORME publica una situación concursal de la empresa (${fmt(actDate(l))}).`,
      evidence: { values: { ...base, act_date: actDate(l), acts: insolvency.length }, sources: insolvency.map(bormeRef), rule: "Cualquier acto de situación concursal publicado en el BORME" },
    });
  }

  const ended = lastOf("dissolution", "extinction");
  if (after(ended, lastOf("reactivation"))) {
    const what = ended!.act_type === "extinction" ? "la extinción" : "la disolución";
    out.push({
      key: "borme_dissolution",
      status: "fail",
      severity: "high",
      message: `El BORME publica ${what} de la sociedad (${fmt(actDate(ended!))}).`,
      evidence: { values: { ...base, act_date: actDate(ended!), act: ended!.act_label }, sources: [bormeRef(ended!)], rule: "Disolución o extinción sin reactivación posterior" },
    });
  }

  const closed = lastOf("sheet_closed");
  if (after(closed, lastOf("sheet_reopened"))) {
    out.push({
      key: "borme_sheet_closed",
      status: "fail",
      severity: "high",
      message: `La hoja registral está cerrada provisionalmente desde el ${fmt(actDate(closed!))}: ${closed!.act_label.toLowerCase()}.`,
      evidence: { values: { ...base, act_date: actDate(closed!), act: closed!.act_label }, sources: [bormeRef(closed!)], rule: "Cierre provisional de la hoja registral sin reapertura posterior" },
    });
  }

  const reductions = sorted.filter((a) => a.act_type === "capital_reduction" && actDate(a) >= monthsBefore(opts.today, 24));
  if (reductions.length) {
    const l = reductions[reductions.length - 1];
    out.push({
      key: "borme_capital_reduction",
      status: "fail",
      severity: "warn",
      message: `Reducción de capital el ${fmt(actDate(l))}${l.details.capital !== undefined ? `; capital resultante ${eur(l.details.capital)}` : ""}.`,
      evidence: { values: { ...base, act_date: actDate(l), amount: l.details.amount ?? null, resulting_capital: l.details.capital ?? null }, sources: reductions.map(bormeRef), rule: "Reducciones de capital en los últimos 24 meses" },
    });
  }

  // Administrator changes: announcements (not the incorporation) that appoint or remove an administrator.
  const yearAgo = monthsBefore(opts.today, 12);
  const byEntry = new Map<string, StoredAct[]>();
  for (const a of sorted) byEntry.set(`${a.borme_id}#${a.entry_number}`, [...(byEntry.get(`${a.borme_id}#${a.entry_number}`) ?? []), a]);
  const changes = [...byEntry.values()].filter(
    (entry) =>
      actDate(entry[0]) >= yearAgo &&
      !entry.some((a) => a.act_type === "constitution") &&
      entry.some((a) => ["appointments", "cessations", "revocations"].includes(a.act_type) && (a.details.officers ?? []).some((o) => isAdminRole(o.role))),
  );
  if (changes.length >= 2) {
    out.push({
      key: "borme_officer_turnover",
      status: "fail",
      severity: "warn",
      message: `${changes.length} cambios de administradores en los últimos 12 meses.`,
      evidence: { values: { ...base, changes: changes.length, from: yearAgo }, sources: changes.map((e) => bormeRef(e[0])), rule: "Dos o más anuncios con nombramientos o ceses de administradores en 12 meses" },
    });
  }

  const moves = sorted.filter((a) => a.act_type === "address_change" && actDate(a) >= yearAgo);
  if (moves.length) {
    const l = moves[moves.length - 1];
    out.push({
      key: "borme_address_change",
      status: "fail",
      severity: "warn",
      message: `Cambio de domicilio social el ${fmt(actDate(l))}${l.details.value ? `: ${l.details.value}` : ""}.`,
      evidence: { values: { ...base, act_date: actDate(l) }, sources: moves.map(bormeRef), rule: "Cambios de domicilio social en los últimos 12 meses" },
    });
  }

  if (profile.constitutedOn && profile.constitutedOn >= monthsBefore(opts.today, 24)) {
    const c = sorted.find((a) => a.act_type === "constitution")!;
    out.push({
      key: "borme_recent_incorporation",
      status: "fail",
      severity: "warn",
      message: `Sociedad constituida el ${fmt(profile.constitutedOn)}: menos de dos años de historia.`,
      evidence: { values: { ...base, act_date: profile.constitutedOn }, sources: [bormeRef(c)], rule: "Constitución en los últimos 24 meses" },
    });
  }

  if (!out.some((c) => c.severity === "high")) {
    out.push({
      key: "borme_no_adverse_acts",
      status: "pass",
      severity: "info",
      message: `Sin concurso, disolución ni cierre de hoja en el BORME${since}.`,
      evidence: { values: { ...base, acts: sorted.length, first_seen: profile.firstSeen }, sources: [bormeRef(sorted[sorted.length - 1])] },
    });
  }
  return out;
}
