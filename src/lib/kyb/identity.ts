/**
 * KYB consistency: who the company is and who runs it, from the name and CIF printed on every document read, the bank
 * account holders, the nota simple when there is one, and, once the lender has confirmed the match, the registry
 * sheet's BORME acts. Pure. Like every check, it says what differs and where; it never decides whether the company
 * passes.
 *
 * A document with another company's CIF never gets here (it is rejected when read, `doc_nif_mismatch`), so the CIF
 * part only counts which documents carry the case's CIF.
 */
import type { CheckResult } from "../checks/engine.ts";
import { holderVerdict } from "../bank/holder.ts";
import { cleanNif } from "../extract/assess.ts";
import { bormeRef, buildProfile, type StoredAct } from "../borme/profile.ts";
import type { ActType } from "../borme/parse.ts";
import type { NotaSimple } from "../schema/canonical.ts";
import { currentBoard, type BoardMember } from "./board.ts";

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
  /** The latest nota simple read, with the maximum age the case asks for. */
  nota?: { docId: string; data: NotaSimple; maxAgeDays: number | null } | null;
  today: string;
}

const NOTA_SITUATION: Record<Exclude<NotaSimple["situation"], "active">, string> = {
  dissolved: "disuelta",
  in_liquidation: "en liquidación",
  extinct: "extinguida",
  insolvency: "en concurso",
  sheet_closed: "con la hoja registral cerrada",
  other: "con una anotación sobre su situación",
};

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
  const nota = input.nota ?? null;
  const notaRef = nota ? `doc:${nota.docId}${nota.data.page ? `:page:${nota.data.page}` : ""}` : null;
  const registryNames = [...(profile ? [profile.name, ...profile.formerNames] : []), ...(nota?.data.name ? [nota.data.name] : [])];
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

  // Without a confirmed registry sheet, the nota simple gives the registered name.
  if (!profile && nota?.data.name && caseName && !sameName(caseName, nota.data.name)) {
    registryDiffers = true;
    out.push({
      key: "kyb_registry_name",
      status: "fail",
      severity: "warn",
      message: `La nota simple está a nombre de «${nota.data.name}», no de «${caseName}». Comprueba si la sociedad ha cambiado de denominación o si la nota es de otra sociedad.`,
      evidence: {
        values: { case_name: caseName, registry_name: nota.data.name, sheet: nota.data.sheet },
        sources: [notaRef!],
        rule: "Denominación del caso distinta de la que figura en la nota simple (sin forma jurídica)",
      },
    });
  }

  // --- Nota simple: whose sheet, its situation, how old it is
  if (nota) {
    if (profile && nota.data.sheet && nota.data.sheet !== profile.sheet) {
      out.push({
        key: "kyb_registry_sheet",
        status: "fail",
        severity: "warn",
        message: `La nota simple es de la hoja ${nota.data.sheet}, pero la confirmada en el Registro Mercantil es la ${profile.sheet}. Una de las dos no es esta sociedad.`,
        evidence: { values: { sheet: profile.sheet, nota_sheet: nota.data.sheet }, sources: [notaRef!, bormeRef(acts[acts.length - 1])], rule: "Hoja registral de la nota simple distinta de la confirmada en el BORME" },
      });
    }
    if (nota.data.situation !== "active") {
      const what = NOTA_SITUATION[nota.data.situation];
      out.push({
        key: "kyb_nota_situation",
        status: "fail",
        severity: nota.data.situation === "other" ? "warn" : "high",
        message: `La nota simple del ${fmt(nota.data.issuedOn)} indica que la sociedad está ${what}${nota.data.situationText ? `: «${nota.data.situationText}»` : ""}.`,
        evidence: { values: { situation: nota.data.situationText ?? what, issued_on: nota.data.issuedOn }, sources: [notaRef!], rule: "Situación distinta de activa en la nota simple" },
      });
    }
    const age = Math.round((Date.parse(input.today) - Date.parse(nota.data.issuedOn)) / 86_400_000);
    if (nota.maxAgeDays !== null && age > nota.maxAgeDays) {
      out.push({
        key: "kyb_nota_simple_age",
        status: "fail",
        severity: "warn",
        message: `La nota simple es del ${fmt(nota.data.issuedOn)}: ${age} días (máximo ${nota.maxAgeDays}). Los cargos o la situación pueden haber cambiado desde entonces.`,
        evidence: { values: { issued_on: nota.data.issuedOn, age_days: age, max_age_days: nota.maxAgeDays }, sources: [notaRef!], rule: "Antigüedad de la nota simple por encima de la del caso" },
      });
    }
  }

  // --- All consistent: say what was compared
  const withCif = input.documents.filter((d) => cif && cleanNif(d.nif) === cif);
  const withoutCif = input.documents.length - withCif.length;
  if (!mismatched.length && !registryDiffers && caseName && (named.length || profile)) {
    const sheet = profile?.sheet ?? nota?.data.sheet ?? null;
    const parts = [
      named.length ? `${named.length} ${named.length === 1 ? "documento" : "documentos"}` : null,
      profile ? `el Registro Mercantil (${profile.sheet})` : nota?.data.name ? `la nota simple${sheet ? ` (${sheet})` : ""}` : null,
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
        values: { case_name: caseName, cif, documents_compared: named.length, documents_with_cif: withCif.length, registry_name: profile?.name ?? nota?.data.name ?? null },
        sources: [...named.map((d) => `doc:${d.docId}`), ...(profile ? [bormeRef(acts[acts.length - 1])] : [])],
      },
    });
  }

  const board = currentBoard(nota ? { docId: nota.docId, data: nota.data } : null, acts);

  if (profile) {
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
  }

  // --- Who runs it: the nota simple and the BORME after it, or the BORME window alone
  if (board) {
    const admins = board.members.filter((m) => m.kind === "administrator");
    const attorneys = board.members.filter((m) => m.kind === "attorney");
    const who = (ms: BoardMember[]) => ms.map((m) => `${m.name} (${m.role}${m.since ? `, desde ${fmt(m.since)}` : ""})`).join("; ");
    const basis = board.nota
      ? `según la nota simple del ${fmt(board.nota.issuedOn)}${board.bormeActs.length ? " y el BORME posterior" : ""}`
      : `según el BORME`;
    const changes = board.nota && board.bormeActs.length
      ? ` Cambios publicados después de la nota: ${board.bormeActs.map((a) => `${a.act_label}, ${fmt(actDate(a))}`).join("; ")}.`
      : "";
    const values = { ...(profile ? { sheet: profile.sheet } : nota?.data.sheet ? { sheet: nota.data.sheet } : {}), officers: admins.length, attorneys: attorneys.length };
    const sources = [...new Set([...board.members.map((m) => m.source), ...board.bormeActs.map(bormeRef)])];
    if (admins.length) {
      out.push({
        key: "kyb_officers",
        status: "pass",
        severity: "info",
        message: `Administración ${basis}: ${who(admins)}${board.nota ? "" : since}.${attorneys.length ? ` Apoderados: ${who(attorneys)}.` : ""}${changes}`,
        evidence: { values, sources },
      });
    } else {
      out.push({
        key: "kyb_officers",
        status: "fail",
        severity: board.nota ? "warn" : "info",
        message: board.nota
          ? `No queda ningún administrador vigente ${basis}.${changes} Comprueba quién administra hoy la sociedad.`
          : `No consta en el BORME quién administra la sociedad${since}: el nombramiento es anterior o no se ha publicado. Una nota simple del Registro Mercantil lo indica.`,
        evidence: {
          values: board.nota ? values : { ...values, acts: acts.length, first_seen: profile?.firstSeen ?? null },
          sources: sources.length ? sources : acts.length ? [bormeRef(acts[acts.length - 1])] : [],
          rule: "Sin administradores vigentes",
        },
      });
    }

    // --- Bank accounts held by one of the company's officers (people, not the company)
    const officerAccounts = input.bankHolders.flatMap((b) => {
      if (caseName && sameName(b.holder, caseName)) return [];
      const o = board.members.find((x) => sameName(b.holder, x.name));
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
          rule: "Titular del extracto con el nombre de un administrador o apoderado inscrito",
        },
      });
    }
  }
  return out;
}
