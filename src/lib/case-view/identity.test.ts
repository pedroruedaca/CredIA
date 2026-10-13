import { describe, expect, it } from "vitest";
import { caseViewSample as sample } from "../__fixtures__/case-view-sample.ts";
import { notaSimpleWire } from "../__fixtures__/nota-simple.ts";
import { buildProfile, type StoredAct } from "../borme/profile.ts";
import { assessExtraction } from "../extract/assess.ts";
import { kybChecks } from "../kyb/identity.ts";
import type { NotaSimple } from "../schema/canonical.ts";
import { packageJson } from "./export.ts";
import { identityView } from "./identity.ts";
import type { CaseViewData } from "./load.ts";
import { buildPackage } from "./package.ts";

const NOTA = (assessExtraction("nota_simple", notaSimpleWire, { fileName: "nota.pdf", caseCif: "B12345674", companyName: "X", lenderName: "L", expectedFiscalYear: null }).canonical as { data: NotaSimple }).data;

function act(published_on: string, entry_number: number, act_type: StoredAct["act_type"], details: StoredAct["details"] = {}, act_label: string = act_type, act_text = ""): StoredAct {
  return {
    published_on, borme_id: `BORME-A-${published_on.slice(0, 4)}-1-28`, province: "MADRID", entry_number, company_name: "DISTRIBUCIONES EJEMPLO SL",
    registry_sheet: "M-654321", registered_on: null, act_index: 0, act_type, act_label, act_text, details,
  };
}
const ACTS: StoredAct[] = [
  act("2025-03-10", 900, "capital_increase", { amount: 7000, capital: 10000 }, "Ampliación de capital"),
  act("2026-09-20", 8000, "address_change", { value: "Calle Nueva 3, 28010 Madrid" }, "Cambio de domicilio social", "Calle Nueva 3, 28010 Madrid"),
  act("2026-09-20", 8001, "appointments", { officers: [{ role: "Apoderado", name: "PEREZ VIDAL JORGE" }] }, "Nombramientos"),
];

const notaDoc = { id: "d-nota", kind: "nota_simple", original_filename: "nota.pdf", issued_on: "2026-09-02", status: "parsed", uploaded_at: "2026-09-03T09:00:00Z", attention_message: null, summary: null };

/** The sample case with a parsed nota simple, a confirmed BORME sheet and the KYB checks the pipeline would store. */
function withIdentity(over: Partial<CaseViewData> = {}): CaseViewData {
  const base: CaseViewData = {
    ...sample,
    kase: { ...sample.kase, companyName: "Distribuciones Ejemplo SL", cif: "B12345674" },
    documents: [...sample.documents, notaDoc],
    nota: { docId: "d-nota", fileName: "nota.pdf", uploadedBy: "lender", status: "parsed", attention: null, data: NOTA },
    registry: { coverage: { from: "2024-10-01", to: "2026-10-12" }, match: { status: "confirmed", sheet: "M-654321", decidedAt: "2026-09-04T10:00:00Z" }, candidates: [], profile: buildProfile(ACTS), acts: ACTS, fetch: null },
    ...over,
  };
  const kyb = kybChecks({ company: { name: base.kase.companyName, cif: base.kase.cif }, documents: [{ docId: "d-nota", fileName: "nota.pdf", name: NOTA.name, nif: NOTA.nif }], bankHolders: [], registry: { acts: base.registry.acts, coverageStart: "2024-10-01" }, nota: { docId: "d-nota", data: NOTA, maxAgeDays: 90 }, today: "2026-10-13" });
  return { ...base, checks: [...sample.checks, ...kyb.map((c, i) => ({ id: 900 + i, check_key: c.key, status: c.status, severity: c.severity, message: c.message, evidence: c.evidence, source: "engine", document_id: null }))] };
}

describe("identityView", () => {
  it("takes each fact from the nota simple, unless the BORME published a newer one", () => {
    const d = withIdentity();
    const v = identityView(d, buildPackage(d))!;
    expect(v.name).toBe("DISTRIBUCIONES EJEMPLO SL");
    expect(v.nota).toEqual({ kind: "parsed", docId: "d-nota", fileName: "nota.pdf", issuedOn: "2026-09-02" });
    expect(Object.fromEntries(v.facts.map((f) => [f.label, [f.value, f.source]]))).toEqual({
      CIF: ["B12345674", null],
      "Hoja registral": ["M-654321", "doc:d-nota:page:1"],
      "Forma jurídica": ["Sociedad Limitada", "doc:d-nota:page:1"],
      // Moved after the nota was issued: the BORME's address.
      "Domicilio social": ["Calle Nueva 3, 28010 Madrid", "borme:2026-09-20:BORME-A-2026-1-28:entry:8000"],
      Constitución: [expect.stringContaining("2018"), "doc:d-nota:page:1"],
      // The 2025 increase is older than the nota: the nota's figure stands.
      Capital: ["3.000 €", "doc:d-nota:page:1"],
      "Socio único": ["GRUPO EJEMPLO INVERSIONES SL", "doc:d-nota:page:1"],
      Situación: ["Activa", "doc:d-nota:page:1"],
      "Objeto social": ["Comercio al por mayor de productos alimenticios", "doc:d-nota:page:1"],
    });
  });

  it("draws the board from the nota simple and the later BORME, and groups the identity checks", () => {
    const d = withIdentity();
    const v = identityView(d, buildPackage(d))!;
    expect(v.board!.members.map((m) => [m.kind, m.name, m.source])).toEqual([
      ["administrator", "GARCÍA LÓPEZ, MARTA", "doc:d-nota:page:1"],
      ["attorney", "PEREZ VIDAL JORGE", "borme:2026-09-20:BORME-A-2026-1-28:entry:8001"],
      ["attorney", "RUIZ SOLER, ANA", "doc:d-nota:page:2"],
    ]);
    expect(v.boardBasis).toMatch(/^Nota simple del .+ y BORME posterior, BORME revisado hasta /);
    expect(v.passed.map((c) => c.key).sort()).toEqual(["kyb_identity_consistent", "kyb_officers"]);
    // Other checks stay in «Para revisar» only.
    expect([...v.open, ...v.passed].every((c) => c.key.startsWith("kyb_"))).toBe(true);
  });

  it("says what the nota simple is waiting on, and draws nothing when there is nothing to show", () => {
    const pending = { ...sample, requirements: [{ doc_kind: "nota_simple", required: false, max_age_days: 90, source: "borrower" as const }] };
    expect(identityView(pending, buildPackage(pending))!.nota).toEqual({ kind: "requested", from: "borrower" });
    const unread = withIdentity({ nota: { docId: "d-nota", fileName: "nota.pdf", uploadedBy: "borrower", status: "needs_review", attention: "No encontramos la fecha.", data: null } });
    expect(identityView(unread, buildPackage(unread))!.nota).toMatchObject({ kind: "failed", attention: "No encontramos la fecha." });
    expect(identityView(sample, buildPackage(sample))).toBeNull();
  });

  it("goes into the JSON export with every fact's source_ref", () => {
    const d = withIdentity();
    const j = packageJson(d, buildPackage(d), "2026-10-13T10:00:00Z") as unknown as { identity: { board: { members: { name: string; source_ref: string }[] }; nota_simple: { sheet: string; source_ref: string } } };
    expect(j.identity.nota_simple).toMatchObject({ sheet: "M-654321", source_ref: "doc:d-nota" });
    expect(j.identity.board.members.map((m) => m.source_ref)).toContain("doc:d-nota:page:1");
  });

  it("prints in the committee PDF", async () => {
    const { packagePdf } = await import("./pdf.tsx");
    const { pdfText } = await import("../borme/fetch.ts");
    const d = withIdentity();
    const text = await pdfText(new Uint8Array(await packagePdf(d, buildPackage(d), "2026-10-13T10:00:00Z")));
    expect(text).toContain("Identidad y titularidad");
    expect(text).toContain("GARCÍA LÓPEZ, MARTA");
    expect(text).toContain("Calle Nueva 3, 28010 Madrid");
  });
});
