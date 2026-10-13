import { describe, expect, it } from "vitest";
import type { StoredAct } from "../borme/profile.ts";
import { kybChecks, type KybInput } from "./identity.ts";

const TODAY = "2026-10-13";

function act(published_on: string, entry_number: number, act_type: StoredAct["act_type"], details: StoredAct["details"] = {}, act_label: string = act_type, extra: Partial<StoredAct> = {}): StoredAct {
  return {
    published_on, borme_id: `BORME-A-${published_on.slice(0, 4)}-1-28`, province: "MADRID", entry_number, company_name: "DISTRIBUCIONES EJEMPLO SL",
    registry_sheet: "M-654321", registered_on: null, act_index: 0, act_type, act_label, act_text: "", details, ...extra,
  };
}

/** Registry history for Distribuciones Ejemplo SL (M-654321), hand-written in the shapes the BORME parser stores. */
const HISTORY: StoredAct[] = [
  act("2018-06-04", 21000, "constitution", { capital: 3000 }, "Constitución", { company_name: "EJEMPLO LOGISTICA SL" }),
  { ...act("2018-06-04", 21000, "appointments", { officers: [{ role: "Adm. Unico", name: "GARCIA LOPEZ MARTA" }] }, "Nombramientos", { company_name: "EJEMPLO LOGISTICA SL" }), act_index: 1 },
  act("2021-03-10", 9000, "appointments", { officers: [{ role: "Apoderado", name: "RUIZ SOLER ANA" }] }, "Nombramientos", { company_name: "EJEMPLO LOGISTICA SL" }),
  act("2022-01-20", 1200, "name_change", { value: "DISTRIBUCIONES EJEMPLO SL" }, "Cambio de denominación social", { company_name: "EJEMPLO LOGISTICA SL", act_text: "DISTRIBUCIONES EJEMPLO SL" }),
  act("2025-11-03", 45000, "sole_shareholder", {}, "Declaración de unipersonalidad", { act_text: "Socio único: GRUPO EJEMPLO INVERSIONES SL" }),
  act("2026-02-16", 7000, "purpose_change", {}, "Cambio de objeto social", { act_text: "Comercio al por mayor de productos alimenticios" }),
];

const DOCS: KybInput["documents"] = [
  { docId: "d-m200", fileName: "modelo200-2025.pdf", name: "DISTRIBUCIONES EJEMPLO, S.L.", nif: "B12345674" },
  { docId: "d-aeat", fileName: "certificado-aeat.pdf", name: "DISTRIBUCIONES EJEMPLO SL", nif: "B-12345674" },
  { docId: "d-cirbe", fileName: "cirbe.pdf", name: "Distribuciones Ejemplo Sociedad Limitada", nif: null },
];

const base = (over: Partial<KybInput> = {}): KybInput => ({
  company: { name: "Distribuciones Ejemplo S.L.", cif: "B12345674" },
  documents: DOCS,
  bankHolders: [{ docId: "d-n43", accountMasked: "2100 0418 ****5678", holder: "DISTRIBUCIONES EJEMPLO S" }],
  registry: { acts: HISTORY, coverageStart: "2024-10-01" },
  today: TODAY,
  ...over,
});
const byKey = (checks: ReturnType<typeof kybChecks>) => Object.fromEntries(checks.map((c) => [c.key, c]));

describe("kybChecks · identity", () => {
  it("passes when every document and the registry carry the case's name, and counts the documents with its CIF", () => {
    const c = byKey(kybChecks(base()));
    expect(c.kyb_name_mismatch).toBeUndefined();
    expect(c.kyb_registry_name).toBeUndefined();
    expect(c.kyb_identity_consistent).toMatchObject({ status: "pass", severity: "info" });
    expect(c.kyb_identity_consistent.message).toBe(
      "La denominación coincide en 3 documentos y el Registro Mercantil (M-654321). El CIF del caso consta en 2 de 3 documentos; en el resto no se ha podido leer.",
    );
    expect(c.kyb_identity_consistent.evidence.sources).toEqual(["doc:d-m200", "doc:d-aeat", "doc:d-cirbe", "borme:2026-02-16:BORME-A-2026-1-28:entry:7000"]);
  });

  it("flags a document printed with a name that is neither the case's nor the registry's", () => {
    const docs = [...DOCS, { docId: "d-solv", fileName: "informa.pdf", name: "TRANSPORTES NORTE SA", nif: "B12345674" }];
    const c = byKey(kybChecks(base({ documents: docs })));
    expect(c.kyb_identity_consistent).toBeUndefined();
    expect(c.kyb_name_mismatch).toMatchObject({ status: "fail", severity: "warn" });
    expect(c.kyb_name_mismatch.message).toContain("«informa.pdf» (TRANSPORTES NORTE SA)");
    expect(c.kyb_name_mismatch.evidence.values).toEqual({ case_name: "Distribuciones Ejemplo S.L.", "informa.pdf": "TRANSPORTES NORTE SA" });
    expect(c.kyb_name_mismatch.evidence.sources).toEqual(["doc:d-solv"]);
  });

  it("explains a document with the company's former registered name instead of flagging it", () => {
    const docs = [...DOCS, { docId: "d-ca", fileName: "cuentas-2021.pdf", name: "EJEMPLO LOGISTICA, S.L.", nif: "B12345674" }];
    const c = byKey(kybChecks(base({ documents: docs })));
    expect(c.kyb_name_mismatch).toBeUndefined();
    expect(c.kyb_identity_consistent.message).toContain("Un documento lleva la denominación anterior de la sociedad.");
  });

  it("without a confirmed registry, a former name cannot be told apart and is flagged", () => {
    const docs = [{ docId: "d-ca", fileName: "cuentas-2021.pdf", name: "EJEMPLO LOGISTICA, S.L.", nif: "B12345674" }];
    const c = byKey(kybChecks(base({ documents: docs, registry: null })));
    expect(c.kyb_name_mismatch.status).toBe("fail");
    expect(c.kyb_officers).toBeUndefined();
  });

  it("says the case uses the former name when the registry shows a rename", () => {
    const c = byKey(kybChecks(base({ company: { name: "Ejemplo Logística SL", cif: "B12345674" }, documents: [] })));
    expect(c.kyb_registry_name).toMatchObject({ status: "fail", severity: "warn" });
    expect(c.kyb_registry_name.message).toBe(
      "La sociedad se llama ahora «DISTRIBUCIONES EJEMPLO SL» en el Registro Mercantil (cambio de denominación publicado el 20/01/2022); el caso usa la denominación anterior.",
    );
    expect(c.kyb_registry_name.evidence.sources).toEqual(["borme:2022-01-20:BORME-A-2022-1-28:entry:1200"]);
  });

  it("flags a confirmed sheet under an unrelated name", () => {
    const c = byKey(kybChecks(base({ company: { name: "Talleres Demo Levante SL", cif: "B12345674" }, documents: [] })));
    expect(c.kyb_registry_name.message).toContain("La hoja registral confirmada (M-654321) está a nombre de «DISTRIBUCIONES EJEMPLO SL»");
  });

  it("says nothing when there is nothing to compare", () => {
    expect(kybChecks(base({ documents: [], bankHolders: [], registry: null }))).toEqual([]);
  });
});

describe("kybChecks · registry", () => {
  it("lists ownership and structure changes, and name or purpose changes, of the last 24 months", () => {
    const c = byKey(kybChecks(base()));
    expect(c.kyb_control_change).toMatchObject({ status: "fail", severity: "warn" });
    expect(c.kyb_control_change.message).toBe(
      "Cambios de socio único o de estructura en los últimos 24 meses: Declaración de unipersonalidad (Socio único: GRUPO EJEMPLO INVERSIONES SL), 03/11/2025. Comprueba quién controla hoy la sociedad.",
    );
    // The 2022 rename is older than 24 months; the 2026 purpose change is not.
    expect(c.kyb_name_or_purpose_change.message).toBe("Cambio de denominación u objeto social en los últimos 24 meses: Cambio de objeto social (Comercio al por mayor de productos alimenticios), 16/02/2026.");
    expect(c.kyb_name_or_purpose_change.evidence.sources).toEqual(["borme:2026-02-16:BORME-A-2026-1-28:entry:7000"]);
  });

  it("names the administrators the BORME shows, with the coverage", () => {
    const c = byKey(kybChecks(base()));
    expect(c.kyb_officers).toMatchObject({ status: "pass", severity: "info" });
    expect(c.kyb_officers.message).toBe("Administración según el BORME: GARCIA LOPEZ MARTA (Adm. Unico, desde 04/06/2018) (BORME revisado desde 01/10/2024).");
    expect(c.kyb_officers.evidence.sources).toEqual(["borme:2018-06-04:BORME-A-2018-1-28:entry:21000"]);
  });

  it("says when no administrator appears in the imported acts", () => {
    const recentOnly = HISTORY.filter((a) => a.published_on >= "2025-01-01");
    const c = byKey(kybChecks(base({ registry: { acts: recentOnly, coverageStart: "2024-10-01" } })));
    expect(c.kyb_officers).toMatchObject({ status: "fail", severity: "info" });
    expect(c.kyb_officers.message).toContain("Una nota simple del Registro Mercantil lo indica.");
  });

  it("flags bank statements held by an administrator or attorney, in any word order", () => {
    const holders = [
      { docId: "d-n43", accountMasked: "2100 0418 ****5678", holder: "DISTRIBUCIONES EJEMPLO S" },
      { docId: "d-n43b", accountMasked: "0049 1500 ****1234", holder: "MARTA GARCIA LOPEZ" },
      { docId: "d-n43c", accountMasked: "0182 2000 ****9999", holder: "ANA RUIZ SOLER" },
      { docId: "d-n43d", accountMasked: "0081 0300 ****0001", holder: "PEDRO SANCHEZ VIDAL" },
    ];
    const c = byKey(kybChecks(base({ bankHolders: holders })));
    expect(c.kyb_officer_bank_account).toMatchObject({ status: "fail", severity: "warn" });
    expect(c.kyb_officer_bank_account.evidence.values).toEqual({ "0049 1500 ****1234": "MARTA GARCIA LOPEZ · Adm. Unico", "0182 2000 ****9999": "ANA RUIZ SOLER · Apoderado" });
    expect(c.kyb_officer_bank_account.evidence.sources).toEqual(["doc:d-n43b", "doc:d-n43c"]);
  });
});
