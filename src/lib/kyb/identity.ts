/**
 * KYB consistency (phase 1): who the company is and who runs it, from what the case already holds — the name and CIF
 * printed on every document read, the bank account holders and, once the lender has confirmed the match, the registry
 * sheet's BORME acts. No new data is requested. Pure. Like every check, it says what differs and where; it never
 * decides whether the company passes.
 *
 * A document with another company's CIF never gets here (it is rejected when read, `doc_nif_mismatch`), so the CIF
 * part only counts which documents carry the case's CIF.
 */
import type { CheckResult } from "../checks/engine.ts";
import { holderVerdict } from "../bank/holder.ts";
import { cleanNif } from "../extract/assess.ts";
import { bormeRef, buildProfile, isAdminRole, type StoredAct } from "../borme/profile.ts";
import type { ActType } from "../borme/parse.ts";

export interface KybDocument {
  docId: string;
  fileName: string;
  /** Company name and NIF as printed on the document (null when not printed). */
  name: string | null;
  nif: string | null;
}

export interface KybBankHolder {
  docId: string;
  accountMasked: string;
  holder: string;
}

export interface KybInput {
  company: { name: string | null; cif: string };
  documents: KybDocument[];
  bankHolders: KybBankHolder[];
  /** The confirmed registry sheet's acts; null until the lender confirms the match. */
  registry: { acts: StoredAct[]; coverageStart: string | null } | null;
  today: string;
}

/** Changes in who owns or what the company is: sole shareholder declared or lost, mergers, spin-offs, transformations. */
const CONTROL_ACTS: ActType[] = ["sole_shareholder", "sole_shareholder_lost", "merger", "spin_off", "transformation"];
const RENAME_ACTS: ActType[] = ["name_change", "purpose_change"];

const actDate = (a: StoredAct) => a.registered_on ?? a.published_on;
const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const byDate = (a: StoredAct, b: StoredAct) => actDate(a).localeCompare(actDate(b)) || a.entry_number - b.entry_number || a.act_index - b.act_index;

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Same company: every identifying word of the shorter name in the longer one (legal forms dropped, cut names allowed). */
const sameName = (a: string | null, b: string | null) => holderVerdict(a, b) === "match";

export function kybChecks(input: KybInput): CheckResult[] {
  const out: CheckResult[] = [];
  const caseName = input.company.name?.trim() || null;
  const cif = cleanNif(input.company.cif);
  const acts = (input.registry?.acts ?? []).filter((a) => a.registry_sheet).sort(byDate);
  const profile = acts.length ? buildProfile(acts) : null;
  const registryNames = profile ? [profile.name, ...profile.formerNames] : [];
  const since = input.registry?.coverageStart ? ` (BORME revisado desde ${fmt(input.registry.coverageStart)})` : "";

  // --- Name on each document vs the case and the registry
  const named = input.documents.filter((d) => d.name?.trim());
  const mismatched = named.filter((d) => caseName && !sameName(d.name, caseName) && !registryNames.some((n) => sameName(d.name, n)));
  const formerOnly = profile ? named.filter((d) => !sameName(d.name, profile.name) && profile.formerNames.some((n) => sameName(d.name, n))) : [];
  if (mismatched.length) {
    const list = mismatched.map((d) => `«${d.fileName}» (${d.name!.trim()})`).join(", ");
    out.push({
      key: "kyb_name_mismatch",
      status: "fail",
      severity: "warn",
      message:
        mismatched.length === 1
          ? `Un documento lleva otra denominación que la del caso (${caseName}): ${list}. El CIF coincide; comprueba si es un nombre comercial, un cambio de denominación o un documento de otra sociedad.`
          : `${mismatched.length} documentos llevan otra denominación que la del caso (${caseName}): ${list}. El CIF coincide; comprueba si es un nombre comercial, un cambio de denominación o documentos de otra sociedad.`,
      evidence: {
        values: { case_name: caseName, ...Object.fromEntries(mismatched.map((d) => [d.fileName, d.name!.trim()])) },
        sources: mismatched.map((d) => `doc:${d.docId}`),
        rule: "Denominación impresa en el documento distinta de la del caso y de las del Registro Mercantil (sin forma jurídica)",
      },
    });
  }

  // --- Case name vs the registry's current name
  let registryDiffers = false;
  if (profile && caseName && !sameName(caseName, profile.name)) {
    registryDiffers = true;
    const rename = [...acts].reverse().find((a) => a.act_type === "name_change") ?? null;
    const wasFormer = profile.formerNames.some((n) => sameName(caseName, n));
    out.push({
      key: "kyb_registry_name",
      status: "fail",
      severity: "warn",
      message: wasFormer
        ? `La sociedad se llama ahora «${profile.name}» en el Registro Mercantil${rename ? ` (cambio de denominación publicado el ${fmt(actDate(rename))})` : ""}; el caso usa la denominación anterior.`
        : `La hoja registral confirmada (${profile.sheet}) está a nombre de «${profile.name}», no de «${caseName}». Comprueba que es la misma sociedad.`,
      evidence: {
        values: { case_name: caseName, registry_name: profile.name, sheet: profile.sheet, former_names: profile.formerNames.join(" · ") || null },
        sources: [bormeRef(rename ?? acts[acts.length - 1])],
        rule: "Denominación del caso distinta de la denominación actual en el BORME (sin forma jurídica)",
      },
    });
  }

  // --- All consistent: say what was compared
  const withCif = input.documents.filter((d) => cif && cleanNif(d.nif) === cif);
  const withoutCif = input.documents.length - withCif.length;
  if (!mismatched.length && !registryDiffers && caseName && (named.length || profile)) {
    const parts = [
      named.length ? `${named.length} ${named.length === 1 ? "documento" : "documentos"}` : null,
      profile ? `el Registro Mercantil (${profile.sheet})` : null,
    ].filter(Boolean);
    const cifNote = input.documents.length
      ? withoutCif
        ? ` El CIF del caso consta en ${withCif.length} de ${input.documents.length} documentos; en el resto no se ha podido leer.`
        : ` El CIF del caso consta en todos.`
      : "";
    const formerNote = formerOnly.length ? ` ${formerOnly.length === 1 ? "Un documento lleva" : `${formerOnly.length} documentos llevan`} la denominación anterior de la sociedad.` : "";
    out.push({
      key: "kyb_identity_consistent",
      status: "pass",
      severity: "info",
      message: `La denominación coincide en ${parts.join(" y ")}.${cifNote}${formerNote}`,
      evidence: {
        values: { case_name: caseName, cif, documents_compared: named.length, documents_with_cif: withCif.length, registry_name: profile?.name ?? null },
        sources: [...named.map((d) => `doc:${d.docId}`), ...(profile ? [bormeRef(acts[acts.length - 1])] : [])],
      },
    });
  }

  if (!profile) return out;
  const base = { sheet: profile.sheet };
  const twoYears = monthsBefore(input.today, 24);
  const recent = (types: ActType[]) => acts.filter((a) => types.includes(a.act_type) && actDate(a) >= twoYears);
  const listActs = (xs: StoredAct[]) => xs.map((a) => `${a.act_label}${a.act_text ? ` (${a.act_text})` : ""}, ${fmt(actDate(a))}`).join("; ");

  // --- Ownership and structure changes
  const control = recent(CONTROL_ACTS);
  if (control.length) {
    out.push({
      key: "kyb_control_change",
      status: "fail",
      severity: "warn",
      message: `Cambios de socio único o de estructura en los últimos 24 meses: ${listActs(control)}. Comprueba quién controla hoy la sociedad.`,
      evidence: {
        values: { ...base, acts: control.length, from: twoYears },
        sources: control.map(bormeRef),
        rule: "Unipersonalidad declarada o perdida, fusión, escisión o transformación publicadas en el BORME en 24 meses",
      },
    });
  }

  const renames = recent(RENAME_ACTS);
  if (renames.length) {
    out.push({
      key: "kyb_name_or_purpose_change",
      status: "fail",
      severity: "warn",
      message: `Cambio de denominación u objeto social en los últimos 24 meses: ${listActs(renames)}.`,
      evidence: {
        values: { ...base, acts: renames.length, from: twoYears },
        sources: renames.map(bormeRef),
        rule: "Cambio de denominación, cambio o ampliación del objeto social publicados en el BORME en 24 meses",
      },
    });
  }

  // --- Who runs it, as far as the BORME window shows
  const admins = profile.officers.filter((o) => isAdminRole(o.role));
  const appointments = acts.filter((a) => ["appointments", "reelections", "constitution"].includes(a.act_type) && (a.details.officers ?? []).some((o) => admins.some((x) => x.name === o.name)));
  if (admins.length) {
    out.push({
      key: "kyb_officers",
      status: "pass",
      severity: "info",
      message: `Administración según el BORME: ${admins.map((o) => `${o.name} (${o.role}${o.since ? `, desde ${fmt(o.since)}` : ""})`).join("; ")}${since}.`,
      evidence: { values: { ...base, officers: admins.length }, sources: appointments.map(bormeRef) },
    });
  } else {
    out.push({
      key: "kyb_officers",
      status: "fail",
      severity: "info",
      message: `No consta en el BORME quién administra la sociedad${since}: el nombramiento es anterior o no se ha publicado. Una nota simple del Registro Mercantil lo indica.`,
      evidence: { values: { ...base, acts: acts.length, first_seen: profile.firstSeen }, sources: [bormeRef(acts[acts.length - 1])], rule: "Sin administradores vigentes entre los actos importados" },
    });
  }

  // --- Bank accounts held by one of the company's officers (people, not the company)
  const officerAccounts = input.bankHolders.flatMap((b) => {
    if (caseName && sameName(b.holder, caseName)) return [];
    const o = profile.officers.find((x) => sameName(b.holder, x.name));
    return o ? [{ ...b, officer: o }] : [];
  });
  if (officerAccounts.length) {
    out.push({
      key: "kyb_officer_bank_account",
      status: "fail",
      severity: "warn",
      message: `Extractos de cuentas a nombre de cargos de la sociedad, no de la empresa: ${officerAccounts.map((b) => `${b.accountMasked} (${b.holder}, ${b.officer.role})`).join(", ")}.`,
      evidence: {
        values: Object.fromEntries(officerAccounts.map((b) => [b.accountMasked, `${b.holder} · ${b.officer.role}`])),
        sources: [...new Set(officerAccounts.map((b) => `doc:${b.docId}`))],
        rule: "Titular del extracto con el nombre de un administrador o apoderado inscrito en el BORME",
      },
    });
  }
  return out;
}
