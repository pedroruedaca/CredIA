import { describe, expect, it } from "vitest";
import { BORME_A_VALENCIA_TEXT } from "../__fixtures__/borme-a-valencia.ts";
import { newActsByCase } from "./notify.ts";
import { parseSectionA } from "./parse.ts";
import { toActRows } from "./rows.ts";

const rows = toActRows(parseSectionA(BORME_A_VALENCIA_TEXT).data, { publishedOn: "2026-09-29", bormeId: "BORME-A-2026-185-46", province: "VALENCIA" });

describe("newActsByCase", () => {
  it("groups the day's acts per case with a confirmed company, in published order, with severity and source", () => {
    const r = newActsByCase(
      [
        { caseId: "c1", lenderId: "l1", sheet: "V-123456" },
        { caseId: "c2", lenderId: "l2", sheet: "V-98765" },
        { caseId: "c3", lenderId: "l1", sheet: "V-000001" },
      ],
      rows,
    );
    expect(r.map((x) => [x.caseId, x.acts.map((a) => `${a.label}:${a.severity}`)])).toEqual([
      ["c1", ["Ceses/Dimisiones:null", "Nombramientos:null", "Ampliación de capital:null", "Cambio de domicilio social:null"]],
      ["c2", ["Situación concursal:high"]],
    ]);
    expect(r[1].acts[0]).toMatchObject({ date: "2026-09-18", source: "borme:2026-09-29:BORME-A-2026-185-46:entry:412347" });
  });
});
