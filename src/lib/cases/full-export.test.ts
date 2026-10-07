import { strFromU8, strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { caseViewSample } from "../__fixtures__/case-view-sample.ts";
import { packageJson } from "../case-view/export.ts";
import { buildPackage } from "../case-view/package.ts";
import { assembleZip, documentEntries, exportFilename, safeName, staleExports } from "./full-export.ts";

const CASE = caseViewSample.kase.id;
const doc = (id: string, kind: string, name: string | null, ext: string) => ({ id, kind, original_filename: name, storage_path: `cases/${CASE}/${kind}/${id}.${ext}` });

describe("«Descargar todo»", () => {
  it("names files safely, by kind and in upload order, so equal names never collide", () => {
    const e = documentEntries([
      doc("a", "cirbe", "cirbe.pdf", "pdf"),
      doc("b", "cirbe", "cirbe.pdf", "pdf"),
      doc("c", "trial_balance", "../../etc/passwd", "xlsx"),
      doc("d", "norma43", null, "n43"),
    ]);
    expect(e.map((x) => x.zipPath)).toEqual([
      "documentos/cirbe/01-cirbe.pdf",
      "documentos/cirbe/02-cirbe.pdf",
      "documentos/sumas-y-saldos/01-passwd.xlsx",
      "documentos/norma-43/01-documento.n43",
    ]);
    expect(safeName('.hidden<>:"|?*\u0007.pdf')).toBe("hidden.pdf");
    expect(exportFilename("CASO-6F1C0A52", "2026-10-07")).toBe("credia-CASO-6F1C0A52-completo-2026-10-07.zip");
  });

  it("removes only zips older than the limit, and anything not named by the export", () => {
    const now = 2_000_000_000_000;
    expect(staleExports([`${now - 120_000}-x.zip`, `${now - 5_000}-y.zip`, "otro.zip"], now, 60_000)).toEqual([`${now - 120_000}-x.zip`, "otro.zip"]);
  });

  it("holds every file and every piece of data of the case, and says what could not be read", () => {
    const pdf = strToU8("%PDF-1.7 cirbe");
    const { zip, missing } = assembleZip({
      readme: { caseRef: "CASO-6F1C0A52", companyName: caseViewSample.kase.companyName, cif: caseViewSample.kase.cif, lenderName: caseViewSample.kase.lenderName, generatedAt: "2026-10-07T10:00:00Z", generatedBy: "owner@fondo.es" },
      caso: { id: CASE, borrower_email: "finanzas@empresa.es" },
      paquete: packageJson(caseViewSample, buildPackage(caseViewSample), "2026-10-07T10:00:00Z"),
      documents: [{ ...doc("c1", "cirbe", "cirbe.pdf", "pdf"), bytes: pdf }, { ...doc("t1", "trial_balance", "sys.xlsx", "xlsx"), bytes: null }],
      holded: [{ name: "s1.json", bytes: strToU8('{"lines":[]}') }],
      bank: [{ booking_date: "2026-01-02", amount: 10, source_ref: "doc:n1:line:3" }],
      communications: { enlaces_gestoria: [{ email: "gestor@asesoria.es" }], asistente_de_documentacion: [], avisos_a_una_persona: [] },
      audit: [{ action: "case.viewed", actor: "u1", at: "2026-10-01T10:00:00Z" }],
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "LEEME.txt", "caso.json", "comunicaciones.json", "documentos.json", "documentos/cirbe/01-cirbe.pdf",
      "holded/s1.json", "movimientos-bancarios.json", "paquete.json", "registro-de-auditoria.json",
    ]);
    expect(strFromU8(files["documentos/cirbe/01-cirbe.pdf"])).toBe("%PDF-1.7 cirbe");
    expect(missing).toEqual(["documentos/sumas-y-saldos/01-sys.xlsx"]);
    const index = JSON.parse(strFromU8(files["documentos.json"]));
    expect(index).toEqual([
      { id: "c1", kind: "cirbe", original_filename: "cirbe.pdf", zipPath: "documentos/cirbe/01-cirbe.pdf", in_zip: true },
      { id: "t1", kind: "trial_balance", original_filename: "sys.xlsx", zipPath: "documentos/sumas-y-saldos/01-sys.xlsx", in_zip: false },
    ]);
    expect(JSON.parse(strFromU8(files["paquete.json"])).format).toBe("credia.package.v1");
    const leeme = strFromU8(files["LEEME.txt"]);
    expect(leeme).toContain("- documentos/: el archivo original tal como se subió");
    expect(leeme).toContain("No se han podido incluir 1 archivo(s): documentos/sumas-y-saldos/01-sys.xlsx");
    expect(leeme).toContain("No incluye las conversaciones privadas de los analistas");
    expect(leeme).toContain("no puntúa ni recomienda");
  });
});
