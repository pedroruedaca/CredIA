/**
 * «Identidad y titularidad» module: who the company is as registered, who runs it today, the nota simple's state and
 * the KYB checks, from the nota simple (as of its issue date) and the confirmed BORME history (newer facts win). Pure;
 * the case view and the PDF draw the same view. Facts only: no verdict on the company.
 */
import { bormeRef } from "../borme/profile.ts";
import { formatDay } from "../format.ts";
import { currentBoard, type Board } from "../kyb/board.ts";
import type { NotaSimple } from "../schema/canonical.ts";
import type { CaseViewData } from "./load.ts";
import type { CasePackage } from "./package.ts";

export interface IdentityFact {
  label: string;
  value: string;
  /** A figure or code (hoja, CIF, capital, dates): drawn in mono. */
  mono?: boolean;
  /** source_ref of the fact (doc:<id>:page:<n> or borme:…). */
  source: string | null;
}

export type NotaState =
  | { kind: "parsed"; docId: string; fileName: string; issuedOn: string }
  | { kind: "reading" | "failed"; docId: string; fileName: string; attention: string | null }
  | { kind: "requested"; from: "borrower" | "lender" }
  | { kind: "not_requested" };

export interface IdentityView {
  name: string;
  formerNames: string[];
  facts: IdentityFact[];
  board: Board | null;
  /** Where the board comes from, in one line ("Nota simple del 2 sept 2026 y BORME posterior"). */
  boardBasis: string | null;
  nota: NotaState;
  open: CasePackage["open"];
  passed: CasePackage["passed"];
}

/** Checks this module groups: the KYB ones and whose bank accounts. */
export const isIdentityCheck = (key: string) => key.startsWith("kyb_") || key === "bank_holder_mismatch";

const SITUATION_LABEL: Record<NotaSimple["situation"], string> = {
  active: "Activa",
  dissolved: "Disuelta",
  in_liquidation: "En liquidación",
  extinct: "Extinguida",
  insolvency: "En concurso",
  sheet_closed: "Hoja registral cerrada",
  other: "Con anotaciones",
};

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} €`;

export function identityView(d: CaseViewData, pkg: Pick<CasePackage, "open" | "passed">): IdentityView | null {
  const nota = d.nota?.data ? { docId: d.nota.docId, data: d.nota.data } : null;
  const notaRef = (page: number | null = nota?.data.page ?? null) => (nota ? `doc:${nota.docId}${page ? `:page:${page}` : ""}` : null);
  const profile = d.registry.profile;
  const acts = profile ? d.registry.acts : [];
  const actDate = (a: (typeof acts)[number]) => a.registered_on ?? a.published_on;
  const afterNota = acts.filter((a) => !nota || actDate(a) > nota.data.issuedOn);
  const lastOf = (type: string) => [...afterNota].filter((a) => a.act_type === type).sort((a, b) => actDate(a).localeCompare(actDate(b))).at(-1) ?? null;

  const open = pkg.open.filter((v) => isIdentityCheck(v.key));
  const passed = pkg.passed.filter((v) => isIdentityCheck(v.key));
  const req = d.requirements.find((r) => r.doc_kind === "nota_simple") ?? null;
  const notaState: NotaState = d.nota
    ? d.nota.data
      ? { kind: "parsed", docId: d.nota.docId, fileName: d.nota.fileName, issuedOn: d.nota.data.issuedOn }
      : { kind: d.nota.status === "failed" || d.nota.status === "needs_review" ? "failed" : "reading", docId: d.nota.docId, fileName: d.nota.fileName, attention: d.nota.attention }
    : req
      ? { kind: "requested", from: req.source }
      : { kind: "not_requested" };
  if (!nota && !profile && !open.length && !passed.length && notaState.kind === "not_requested") return null;

  const facts: IdentityFact[] = [];
  const fact = (label: string, value: string | null | undefined, source: string | null, mono = false) => {
    if (value) facts.push({ label, value, source, ...(mono ? { mono } : {}) });
  };
  fact("CIF", d.kase.cif, null, true);
  fact("Hoja registral", profile?.sheet ?? nota?.data.sheet, profile ? bormeRef(acts[acts.length - 1]) : notaRef(), true);
  fact("Forma jurídica", nota?.data.legalForm, notaRef());
  const move = lastOf("address_change");
  if (move?.details.value) fact("Domicilio social", move.details.value, bormeRef(move));
  else fact("Domicilio social", nota?.data.office, notaRef());
  const constituted = nota?.data.incorporatedOn ?? profile?.constitutedOn ?? null;
  fact("Constitución", constituted ? formatDay(constituted) : null, nota?.data.incorporatedOn ? notaRef() : null, true);
  // Capital: the newer of the nota simple and the BORME's latest act stating it.
  const bormeCapital = profile?.capital && (!nota || profile.capital.date > nota.data.issuedOn) ? profile.capital : null;
  if (bormeCapital) fact("Capital", eur(bormeCapital.amount), profile!.capitalHistory.find((c) => c.date === bormeCapital.date)?.source ?? null, true);
  else if (nota?.data.capital !== null && nota?.data.capital !== undefined) fact("Capital", eur(nota.data.capital), notaRef(), true);
  else if (profile?.capital) fact("Capital", eur(profile.capital.amount), profile.capitalHistory.find((c) => c.date === profile.capital!.date)?.source ?? null, true);
  const lost = lastOf("sole_shareholder_lost");
  const declared = lastOf("sole_shareholder");
  if (lost && (!declared || actDate(lost) >= actDate(declared))) fact("Socio único", `Pierde la unipersonalidad el ${formatDay(actDate(lost))}`, bormeRef(lost));
  else if (declared) fact("Socio único", declared.act_text || declared.act_label, bormeRef(declared));
  else fact("Socio único", nota?.data.soleShareholder, notaRef());
  fact("Situación", nota ? SITUATION_LABEL[nota.data.situation] + (nota.data.situationText ? ` · ${nota.data.situationText}` : "") : null, notaRef());
  fact("Objeto social", nota?.data.purpose, notaRef());

  const board = currentBoard(nota, acts);
  const coverage = d.registry.coverage;
  const boardBasis = board
    ? board.nota
      ? `Nota simple del ${formatDay(board.nota.issuedOn)}${profile ? `${board.bormeActs.length ? " y BORME posterior" : ""}, BORME revisado hasta ${formatDay(coverage?.to)}` : ""}`
      : `BORME desde ${formatDay(coverage?.from)}: un cargo nombrado antes no aparece`
    : null;

  return {
    name: profile?.name ?? nota?.data.name ?? d.kase.companyName,
    formerNames: profile?.formerNames ?? [],
    facts,
    board,
    boardBasis,
    nota: notaState,
    open,
    passed,
  };
}
