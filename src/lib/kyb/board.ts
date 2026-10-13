/**
 * Who runs the company today: the positions in force in the latest nota simple, then the BORME acts published after
 * it was issued (appointments add, cessations and revocations remove). Without a nota simple, only the BORME acts
 * imported (the index keeps 24 months), so an administrator appointed earlier does not appear. Pure.
 */
import { companyKey } from "../borme/names.ts";
import { bormeRef, isAdminRole, type StoredAct } from "../borme/profile.ts";
import type { NotaSimple } from "../schema/canonical.ts";

export type MemberKind = "administrator" | "attorney" | "other";

export interface BoardMember {
  kind: MemberKind;
  role: string;
  name: string;
  since: string | null;
  /** Where it comes from: the nota simple (doc:<id>:page:<n>) or the BORME announcement that appointed them. */
  source: string;
}

export interface Board {
  members: BoardMember[];
  /** The nota simple it starts from, if any. */
  nota: { docId: string; issuedOn: string } | null;
  /** BORME acts applied on top (after the nota simple, or all of them without one), oldest first. */
  bormeActs: StoredAct[];
}

/** Same person or company however the name is written: "GARCÍA LÓPEZ, MARTA" = "MARTA GARCIA LOPEZ". */
export const personKey = (name: string) => companyKey(name).split(" ").filter(Boolean).sort().join(" ");

const actDate = (a: StoredAct) => a.registered_on ?? a.published_on;
const byDate = (a: StoredAct, b: StoredAct) => actDate(a).localeCompare(actDate(b)) || a.entry_number - b.entry_number || a.act_index - b.act_index;

function kindOfRole(role: string): MemberKind | null {
  if (/auditor/i.test(role)) return null;
  if (isAdminRole(role)) return "administrator";
  if (/apod/i.test(role)) return "attorney";
  return "other";
}

const OFFICER_ACTS = new Set(["appointments", "reelections", "cessations", "revocations", "officers_cancelled", "extinction"]);

export function currentBoard(nota: { docId: string; data: NotaSimple } | null, acts: StoredAct[]): Board | null {
  const after = nota ? acts.filter((a) => actDate(a) > nota.data.issuedOn) : acts;
  const applied = after.filter((a) => a.registry_sheet && OFFICER_ACTS.has(a.act_type)).sort(byDate);
  if (!nota && !acts.length) return null;

  const members: BoardMember[] = nota
    ? nota.data.positions
        .filter((p) => p.kind !== "auditor")
        .map((p) => ({
          kind: p.kind === "administrator" || p.kind === "attorney" ? p.kind : "other",
          role: p.role,
          name: p.name,
          since: p.since,
          source: `doc:${nota.docId}${p.page ? `:page:${p.page}` : ""}`,
        }))
    : [];
  const sameAs = (m: BoardMember, name: string, kind: MemberKind) => personKey(m.name) === personKey(name) && (m.kind === "administrator") === (kind === "administrator");

  for (const a of applied) {
    const listed = a.details.officers ?? [];
    switch (a.act_type) {
      case "appointments":
      case "reelections":
        for (const o of listed) {
          const kind = kindOfRole(o.role);
          if (kind && !members.some((m) => sameAs(m, o.name, kind))) members.push({ kind, role: o.role, name: o.name, since: actDate(a), source: bormeRef(a) });
        }
        break;
      case "cessations":
      case "revocations":
      case "officers_cancelled":
        if (a.act_type === "officers_cancelled" && !listed.length) members.length = 0;
        for (const o of listed) {
          const kind = kindOfRole(o.role) ?? "other";
          for (let i = members.length - 1; i >= 0; i--) if (sameAs(members[i], o.name, kind)) members.splice(i, 1);
        }
        break;
      case "extinction":
        members.length = 0;
        break;
    }
  }
  const order: Record<MemberKind, number> = { administrator: 0, attorney: 1, other: 2 };
  members.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
  return { members, nota: nota ? { docId: nota.docId, issuedOn: nota.data.issuedOn } : null, bormeActs: applied };
}
