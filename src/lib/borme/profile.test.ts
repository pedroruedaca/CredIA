import { describe, expect, it } from "vitest";
import { BORME_A_VALENCIA_TEXT } from "../__fixtures__/borme-a-valencia.ts";
import { companyKey } from "./names.ts";
import { parseSectionA } from "./parse.ts";
import { bormeChecks, buildProfile } from "./profile.ts";
import { toActRows, type ActRow } from "./rows.ts";
import { sectionAPdfs } from "./sumario.ts";

const meta = { publishedOn: "2026-09-29", bormeId: "BORME-A-2026-185-46", province: "VALENCIA", pdfUrl: "https://www.boe.es/x.pdf" };
const rows = toActRows(parseSectionA(BORME_A_VALENCIA_TEXT, { province: "VALENCIA" }).data, meta);
const sheet = (s: string) => rows.filter((r) => r.registry_sheet === s);
const TODAY = "2026-09-30";

/** Hand-written earlier history for Talleres Demo Levante (V-123456). */
function act(published_on: string, entry_number: number, act_type: ActRow["act_type"], details: ActRow["details"] = {}, act_label: string = act_type): ActRow {
  return {
    published_on, borme_id: `BORME-A-${published_on.slice(0, 4)}-1-46`, province: "VALENCIA", pdf_url: "", entry_number, company_name: "TALLERES DEMO LEVANTE SL",
    company_norm: "TALLERES DEMO LEVANTE", registry_sheet: "V-123456", registered_on: null, act_index: 0, act_type, act_label, act_text: "", details,
  };
}
const history: ActRow[] = [
  act("2019-03-04", 1000, "constitution", { capital: 3000 }, "Constitución"),
  { ...act("2019-03-04", 1000, "appointments", { officers: [{ role: "Adm. Unico", name: "LOPEZ MARTIN JUAN" }] }, "Nombramientos"), act_index: 1 },
  act("2026-02-10", 2000, "appointments", { officers: [{ role: "Apoderado", name: "RUIZ SOLER ANA" }] }, "Nombramientos"),
  act("2026-05-12", 3000, "cessations", { officers: [{ role: "Apoderado", name: "RUIZ SOLER ANA" }] }, "Ceses/Dimisiones"),
];

describe("companyKey", () => {
  it("makes lender and BORME spellings comparable", () => {
    expect(companyKey("Talleres Demo Levante, S.L.")).toBe("TALLERES DEMO LEVANTE");
    expect(companyKey("TALLERES DEMO LEVANTE SL")).toBe("TALLERES DEMO LEVANTE");
    expect(companyKey("Construcciones Albufera 2010, Sociedad Anónima")).toBe("CONSTRUCCIONES ALBUFERA 2010");
    expect(companyKey("DISEÑO RIBERA SLU EN LIQUIDACION")).toBe("DISENO RIBERA"); // Ñ folds to N on both sides
    expect(companyKey("Pérez & Hijos S.A.U.")).toBe("PEREZ Y HIJOS");
    expect(companyKey("SL")).toBe("SL");
  });
});

describe("sectionAPdfs", () => {
  it("lists Section A PDFs from the BOE index, wherever they are nested", () => {
    const json = {
      status: { code: "200" },
      data: {
        sumario: {
          diario: [
            {
              sumario_diario: { identificador: "BORME-S-2026-185", url_pdf: { texto: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-S-2026-185.pdf" } },
              seccion: [
                { codigo: "A", item: [{ identificador: "BORME-A-2026-185-46", titulo: "VALENCIA", url_pdf: { szBytes: "1", texto: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf" } }, { identificador: "BORME-A-2026-185-28", titulo: "MADRID" }] },
                { codigo: "C", item: [{ identificador: "BORME-C-2026-9999", titulo: "Convocatorias" }] },
              ],
            },
          ],
        },
      },
    };
    expect(sectionAPdfs(json, "2026-09-29")).toEqual([
      { id: "BORME-A-2026-185-46", province: "VALENCIA", url: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-46.pdf" },
      { id: "BORME-A-2026-185-28", province: "MADRID", url: "https://www.boe.es/borme/dias/2026/09/29/pdfs/BORME-A-2026-185-28.pdf" },
    ]);
    expect(sectionAPdfs({ error: "x" }, "2026-09-29")).toEqual([]);
  });
});

describe("buildProfile", () => {
  it("tracks current officers, capital and the timeline", () => {
    const p = buildProfile([...history, ...sheet("V-123456")])!;
    expect(p.name).toBe("TALLERES DEMO LEVANTE SL");
    expect(p.constitutedOn).toBe("2019-03-04");
    expect(p.capital).toEqual({ amount: 60000, date: "2026-09-23" });
    // López ceased; two joint administrators and a proxy appointed; Ruiz came and went.
    expect(p.officers.map((o) => `${o.role}: ${o.name}`)).toEqual([
      "Adm. Solid.: GARCIA RUIZ MARIA",
      "Adm. Solid.: SANZ PONS PEDRO",
      "Apoderado: FERRER VIDAL LUIS",
    ]);
    expect(p.capitalHistory.map((c) => [c.date, c.type, c.capital])).toEqual([
      ["2026-09-23", "capital_increase", 60000],
      ["2019-03-04", "constitution", 3000],
    ]);
    expect(p.timeline[0]).toMatchObject({ date: "2026-09-23", type: "address_change", source: "borme:2026-09-29:BORME-A-2026-185-46:entry:412348" });
  });

  it("keeps the former names of a renamed company", () => {
    const p = buildProfile(sheet("V-7777"))!;
    expect(p.name).toBe("MUEBLES RIBERA SL");
    expect(buildProfile([...sheet("V-7777"), { ...sheet("V-7777")[0], company_name: "DISEÑO RIBERA SL", published_on: "2026-10-05", registered_on: "2026-10-01", act_type: "other" }])!.formerNames).toEqual(["MUEBLES RIBERA SL"]);
  });
});

describe("bormeChecks", () => {
  const keys = (acts: ActRow[]) => bormeChecks(acts, { today: TODAY, coverageStart: "2023-10-02" }).map((c) => `${c.key}:${c.status}:${c.severity}`);

  it("clean history: only address change warning and a passing check with the coverage caveat", () => {
    const checks = bormeChecks([...history, ...sheet("V-123456")], { today: TODAY, coverageStart: "2023-10-02" });
    expect(checks.map((c) => c.key)).toEqual(["borme_address_change", "borme_no_adverse_acts"]);
    expect(checks[1].message).toContain("desde 02/10/2023");
    expect(checks[0].evidence.sources).toEqual(["borme:2026-09-29:BORME-A-2026-185-46:entry:412348"]);
  });

  it("flags insolvency, closed sheet and capital reduction", () => {
    expect(keys(sheet("V-98765"))).toEqual(["borme_insolvency:fail:high"]);
    expect(keys(sheet("V-55555"))).toEqual(["borme_sheet_closed:fail:high"]);
    expect(keys(sheet("V-7777"))).toEqual(["borme_capital_reduction:fail:warn", "borme_no_adverse_acts:pass:info"]);
  });

  it("does not flag a closed sheet that was reopened, nor a dissolution followed by reactivation", () => {
    const reopened = [...sheet("V-55555"), { ...sheet("V-55555")[0], registered_on: "2026-09-25", act_type: "sheet_reopened" as const }];
    expect(keys(reopened)).toEqual(["borme_no_adverse_acts:pass:info"]);
    const dissolved = [act("2025-01-10", 1, "dissolution", {}, "Disolución")];
    expect(keys(dissolved)).toEqual(["borme_dissolution:fail:high"]);
    expect(keys([...dissolved, act("2025-06-10", 2, "reactivation")])).toEqual(["borme_no_adverse_acts:pass:info"]);
  });

  it("flags two or more administrator changes in 12 months, not proxies nor the incorporation", () => {
    expect(keys(history)).toEqual(["borme_no_adverse_acts:pass:info"]);
    const turnover = [...history, act("2026-01-15", 4000, "cessations", { officers: [{ role: "Adm. Unico", name: "LOPEZ MARTIN JUAN" }] })];
    expect(keys(turnover)).toEqual(["borme_no_adverse_acts:pass:info"]);
    expect(keys([...turnover, act("2026-08-15", 5000, "appointments", { officers: [{ role: "Adm. Unico", name: "NUEVO ADM" }] })])).toEqual([
      "borme_officer_turnover:fail:warn",
      "borme_no_adverse_acts:pass:info",
    ]);
  });

  it("flags a company incorporated in the last two years", () => {
    expect(keys(sheet("V-212345"))).toEqual(["borme_recent_incorporation:fail:warn", "borme_no_adverse_acts:pass:info"]);
  });

  it("returns nothing without acts", () => {
    expect(bormeChecks([], { today: TODAY, coverageStart: null })).toEqual([]);
  });
});
