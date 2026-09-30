import { describe, expect, it } from "vitest";
import { BORME_A_REAL_SHAPES_TEXT, BORME_A_VALENCIA_TEXT } from "../__fixtures__/borme-a-valencia.ts";
import { companyKey } from "./names.ts";
import { cleanText, parseRegistry, parseSectionA } from "./parse.ts";

describe("parseSectionA", () => {
  const { data, warnings } = parseSectionA(BORME_A_VALENCIA_TEXT, { province: "VALENCIA" });
  const byNumber = (n: number) => data.find((e) => e.number === n)!;

  it("finds every announcement by its consecutive number, across a page break", () => {
    expect(data.map((e) => e.number)).toEqual([412345, 412346, 412347, 412348, 412349, 412350]);
    expect(warnings).toEqual([]);
  });

  it("reads the company, the registry sheet and the registration date", () => {
    const e = byNumber(412346);
    expect(e.company).toBe("TALLERES DEMO LEVANTE SL");
    expect(e.registry?.sheet).toBe("V-123456");
    expect(e.registeredOn).toBe("2026-09-21");
    // Sheet number wrapped onto the next line.
    expect(byNumber(412345).registry?.sheet).toBe("V-212345");
  });

  it("splits a constitution into its acts, with capital and the first administrator", () => {
    const e = byNumber(412345);
    expect(e.acts.map((a) => a.type)).toEqual(["constitution", "sole_shareholder", "appointments"]);
    expect(e.acts[0].details.capital).toBe(3000);
    expect(e.acts[2].details.officers).toEqual([{ role: "Adm. Unico", name: "PEREZ GARCIA ANA" }]);
  });

  it("reads officer changes, several names per role and proxies", () => {
    const e = byNumber(412346);
    expect(e.acts.map((a) => a.type)).toEqual(["cessations", "appointments"]);
    expect(e.acts[0].details.officers).toEqual([{ role: "Adm. Unico", name: "LOPEZ MARTIN JUAN" }]);
    expect(e.acts[1].details.officers).toEqual([
      { role: "Adm. Solid.", name: "GARCIA RUIZ MARIA" },
      { role: "Adm. Solid.", name: "SANZ PONS PEDRO" },
      { role: "Apoderado", name: "FERRER VIDAL LUIS" },
    ]);
  });

  it("keeps an insolvency entry whole although the page furniture cuts it", () => {
    const e = byNumber(412347);
    expect(e.acts.map((a) => a.type)).toEqual(["insolvency"]);
    expect(e.acts[0].text).toContain("Declaración de concurso. Adm. Concursal: GOMEZ TORRES ELENA");
    expect(e.acts[0].text).not.toMatch(/BOLET|cve|Pág/);
    expect(e.registry?.sheet).toBe("V-98765");
  });

  it("reads capital increases and reductions, a new address with a hyphenated word and a new name", () => {
    const inc = byNumber(412348).acts;
    expect(inc.map((a) => a.type)).toEqual(["capital_increase", "address_change"]);
    expect(inc[0].details).toEqual({ amount: 57000, capital: 60000 });
    expect(inc[1].details.value).toBe("AVDA DEL PUERTO 200 (VALENCIA)");
    const red = byNumber(412350).acts;
    expect(red.map((a) => a.type)).toEqual(["name_change", "capital_reduction"]);
    expect(red[0].details.value).toBe("DISEÑO RIBERA SL");
    expect(red[1].details).toEqual({ amount: 20000, capital: 40000 });
  });

  it("recognises a provisional closure of the registry sheet", () => {
    expect(byNumber(412349).acts.map((a) => a.type)).toEqual(["sheet_closed"]);
  });

  it("keeps unknown text as a warning instead of failing", () => {
    const r = parseSectionA("412400 - EMPRESA RARA SL. Algo nuevo sin etiqueta conocida.");
    expect(r.data).toHaveLength(1);
    expect(r.data[0].acts).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(["borme_entry_without_acts", "borme_no_registry_data"]);
    expect(parseSectionA("").data).toEqual([]);
  });

  it("ignores numbers inside an entry that do not continue the sequence", () => {
    const r = parseSectionA(
      "100 - ALFA SL. Constitución. Objeto social: Venta de 2 - 3 plazas. Capital: 3.000,00 Euros. Datos registrales. H M 1, I/A 1 (01.09.26). 101 - BETA SL. Disolución. Voluntaria. Datos registrales. H M 2, I/A 3 (02.09.26).",
    );
    expect(r.data.map((e) => [e.number, e.company])).toEqual([[100, "ALFA SL"], [101, "BETA SL"]]);
    expect(r.data[1].acts.map((a) => a.type)).toEqual(["dissolution"]);
  });
});

describe("parseSectionA on shapes from the live BORME", () => {
  const { data, warnings } = parseSectionA(BORME_A_REAL_SHAPES_TEXT, { province: "BARCELONA" });
  const e = (n: number) => data.find((x) => x.number === n)!;

  it("parses every entry with its sheet and date, and no page furniture in the text", () => {
    expect(warnings).toEqual([]);
    expect(data.map((x) => [x.number, x.registry?.sheet, x.registeredOn])).toEqual([
      [500001, "B-700001", "2026-09-22"],
      [500002, "SC-1234", "2026-08-07"],
      [500003, "SE-145246", "2026-09-18"],
      [500004, "AL-39922", "2026-09-22"],
    ]);
    expect(JSON.stringify(data)).not.toMatch(/BOLET|cve:|Verificable|ISSN/);
  });

  it("finds 'Datos registrales' without a full stop before it", () => {
    expect(e(500001).acts.map((a) => a.type)).toEqual(["constitution", "appointments", "other"]);
    expect(e(500001).acts[2].text).toBe("DECLARACION DE SOCIEDAD UNIPERSONAL, SIENDO SOCIO UNICO ANNA PUIG SOLER");
    expect(e(500003).acts.map((a) => a.type)).toEqual(["cessations", "appointments", "other"]);
  });

  it("reads roles in capitals, with slashes and digits", () => {
    expect(e(500001).acts[1].details.officers).toEqual([{ role: "ADM.UNICO", name: "PUIG SOLER ANNA" }]);
    expect(e(500002).acts[0].details.officers).toEqual([
      { role: "APOD.SOL/MAN", name: "VIDAL MAS JORDI" },
      { role: "APOD.SOL/MAN", name: "ROCA PONS MARTA" },
      { role: "REPR.143 RRM", name: "SERRA COLL PAU" },
    ]);
  });

  it("ends the name at '(R.M. …)' and ignores it in the company key", () => {
    expect(e(500002).company).toBe("EJEMPLO SUR DEL NORTE SL(R.M. SANTIAGO DE COMPOSTELA)");
    expect(companyKey(e(500002).company)).toBe("EJEMPLO SUR DEL NORTE");
  });

  it("recognises a closure label that contains 'Art.485'", () => {
    expect(e(500004).acts.map((a) => [a.type, a.label])).toEqual([
      ["sheet_closed", "Cierre provisional hoja registral Art.485 TRLC"],
      ["insolvency", "Situación concursal"],
    ]);
  });
});

describe("helpers", () => {
  it("drops page furniture and joins hyphenated words", () => {
    expect(cleanText("BOLETÍN OFICIAL DEL REGISTRO MERCANTIL\nObjeto: socie-\ndad (VALEN-\nCIA).\ncve: BORME-A-2026-1-2")).toBe("Objeto: sociedad (VALENCIA).");
    // A dash before a word in another case is kept.
    expect(cleanText("GARCIA-\nde la Torre")).toBe("GARCIA- de la Torre");
  });
  it("normalises the registry sheet", () => {
    expect(parseRegistry("T 1 , F 2, S 8, H M 123456, I/A 5 (22.09.26)").sheet).toBe("M-123456");
    expect(parseRegistry("S 8 , H MU 1234, I/A 1").sheet).toBe("MU-1234");
    expect(parseRegistry("T 1, F 2").sheet).toBeNull();
  });
});
