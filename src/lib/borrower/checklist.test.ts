import { describe, expect, it } from "vitest";
import { buildChecklist, daysBetween, freshnessWindow, isStale, type ChecklistDocument, type ChecklistHolded, type ChecklistInput } from "./checklist.ts";

const TODAY = "2026-09-28";
const NOW = new Date("2026-09-28T10:00:00Z");

// The case from design/borrower-checklist.html.
const requirements = [
  { doc_kind: "trial_balance", required: true, max_age_days: null },
  { doc_kind: "norma43", required: true, max_age_days: null },
  { doc_kind: "cirbe", required: true, max_age_days: null },
  { doc_kind: "modelo200", required: true, max_age_days: null },
  { doc_kind: "aeat_cert", required: true, max_age_days: null },
  { doc_kind: "tgss_cert", required: true, max_age_days: 90 },
  { doc_kind: "cuentas_anuales", required: false, max_age_days: null },
];

let seq = 0;
function doc(kind: string, over: Partial<ChecklistDocument> = {}): ChecklistDocument {
  seq += 1;
  return { id: `d${seq}`, kind, status: "uploaded", original_filename: `${kind}.pdf`, issued_on: null, attention_message: null, uploaded_at: `2026-09-2${seq % 8}T09:00:00Z`, ...over };
}

const holdedSynced: ChecklistHolded = {
  id: "h1",
  status: "synced",
  mode: "one_time",
  revoked_at: null,
  created_at: "2026-09-27T08:00:00Z",
  periods: [
    { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" },
    { kind: "ytd", start: "2026-01-01", end: TODAY },
  ],
};

function input(over: Partial<ChecklistInput>): ChecklistInput {
  return { lenderName: "Fondo Ejemplo Capital", requirements, documents: [], holded: [], today: TODAY, now: NOW, ...over };
}

const byKind = (c: ReturnType<typeof buildChecklist>, k: string) => c.items.find((i) => i.kind === k)!;

describe("buildChecklist", () => {
  it("reproduces the design: 3 of 6 required done, stale TGSS certificate needs attention", () => {
    const c = buildChecklist(
      input({
        holded: [holdedSynced],
        documents: [
          doc("modelo200", { status: "parsed", original_filename: "modelo200_2024.pdf" }),
          doc("aeat_cert", { status: "parsed", issued_on: "2026-09-22" }),
          doc("tgss_cert", { status: "parsed", issued_on: "2026-03-10" }),
        ],
      }),
    );
    expect(c.total).toBe(6); // cuentas anuales is optional
    expect(c.done).toBe(3);
    expect(c.allRequiredDone).toBe(false);
    expect(c.missing).toEqual(["norma43", "cirbe", "tgss_cert"]);
    expect(c.firstIncomplete).toBe("norma43");

    expect(byKind(c, "trial_balance").summary).toBe("Conectado con Holded · ejercicio 2025 y 2026 hasta hoy importados");
    expect(byKind(c, "modelo200").summary).toBe("modelo200_2024.pdf · leído correctamente");
    expect(byKind(c, "aeat_cert").summary).toMatch(/^Emitido el 22 sept? 2026$/);

    const tgss = byKind(c, "tgss_cert");
    expect(tgss.state).toBe("attention");
    expect(tgss.fix).toBe("El certificado subido es de marzo de 2026. Fondo Ejemplo Capital necesita uno de los últimos 3 meses.");
    expect(tgss.files[0]).toMatchObject({ label: "demasiado antiguo", tone: "problem" });
  });

  it("orders items by the standard document order regardless of input order", () => {
    const c = buildChecklist(input({ requirements: [...requirements].reverse() }));
    expect(c.items.map((i) => i.kind)).toEqual(["trial_balance", "norma43", "modelo200", "cuentas_anuales", "cirbe", "aeat_cert", "tgss_cert"]);
  });

  it("a fresh certificate uploaded after a stale one completes the item", () => {
    const c = buildChecklist(
      input({
        documents: [
          doc("tgss_cert", { issued_on: "2026-03-10", uploaded_at: "2026-09-20T09:00:00Z" }),
          doc("tgss_cert", { issued_on: "2026-09-25", uploaded_at: "2026-09-28T09:00:00Z" }),
        ],
      }),
    );
    const tgss = byKind(c, "tgss_cert");
    expect(tgss.state).toBe("done");
    expect(tgss.summary).toMatch(/· vigente$/);
  });

  it("freshness boundary: exactly max_age_days old is still valid", () => {
    expect(isStale("2026-06-30", 90, TODAY)).toBe(false);
    expect(isStale("2026-06-29", 90, TODAY)).toBe(true);
    expect(isStale(null, 90, TODAY)).toBe(false);
    expect(isStale("2020-01-01", null, TODAY)).toBe(false);
  });

  it("a document that failed processing shows the processing message, or a default", () => {
    const withMsg = buildChecklist(input({ documents: [doc("cirbe", { status: "failed", attention_message: "El PDF está protegido con contraseña." })] }));
    expect(byKind(withMsg, "cirbe")).toMatchObject({ state: "attention", fix: "El PDF está protegido con contraseña." });
    const noMsg = buildChecklist(input({ documents: [doc("cirbe", { status: "needs_review", original_filename: "cirbe.pdf" })] }));
    expect(byKind(noMsg, "cirbe").fix).toContain("No hemos podido leer «cirbe.pdf»");
  });

  it("a document being parsed is in progress and does not count as done", () => {
    const c = buildChecklist(input({ documents: [doc("norma43", { status: "parsing" })] }));
    expect(byKind(c, "norma43").state).toBe("in_progress");
    expect(c.missing).toContain("norma43");
  });

  it("several Norma 43 files are summarised by count", () => {
    const c = buildChecklist(input({ documents: [doc("norma43"), doc("norma43"), doc("norma43", { status: "failed" })] }));
    const n43 = byKind(c, "norma43");
    expect(n43.state).toBe("done");
    expect(n43.summary).toBe("2 ficheros recibidos");
    expect(n43.files).toHaveLength(3);
  });

  it("Holded: a failed newer connection needs attention; an earlier successful sync still counts", () => {
    const failed: ChecklistHolded = { ...holdedSynced, id: "h2", status: "missing_scope", periods: [], created_at: "2026-09-28T08:00:00Z" };
    const onlyFailed = buildChecklist(input({ holded: [failed] }));
    expect(byKind(onlyFailed, "trial_balance").state).toBe("attention");
    expect(byKind(onlyFailed, "trial_balance").fix).toContain("faltan permisos");

    const both = buildChecklist(input({ holded: [holdedSynced, failed] }));
    expect(byKind(both, "trial_balance").state).toBe("done");
  });

  it("Holded: a sync stuck in 'syncing' for more than 10 minutes is treated as failed", () => {
    const running: ChecklistHolded = { ...holdedSynced, status: "syncing", periods: [], created_at: "2026-09-28T09:55:00Z" };
    expect(byKind(buildChecklist(input({ holded: [running] })), "trial_balance").state).toBe("in_progress");
    const stuck = { ...running, created_at: "2026-09-28T09:00:00Z" };
    expect(byKind(buildChecklist(input({ holded: [stuck] })), "trial_balance").state).toBe("attention");
  });

  it("an uploaded trial balance completes accounting without Holded", () => {
    const c = buildChecklist(input({ documents: [doc("trial_balance", { original_filename: "sumas_2025.xlsx" })] }));
    expect(byKind(c, "trial_balance")).toMatchObject({ state: "done", summary: "sumas_2025.xlsx · recibido", holded: null });
  });

  it("all required done enables submission even with optional items pending", () => {
    const docs = ["norma43", "cirbe", "modelo200", "aeat_cert"].map((k) => doc(k));
    docs.push(doc("tgss_cert", { issued_on: "2026-09-01" }));
    const c = buildChecklist(input({ holded: [holdedSynced], documents: docs }));
    expect(c.allRequiredDone).toBe(true);
    expect(c.firstIncomplete).toBe("cuentas_anuales");
  });

  it("ignores requirement kinds the portal does not collect", () => {
    const c = buildChecklist(input({ requirements: [{ doc_kind: "borme", required: true, max_age_days: null }] }));
    expect(c.items).toEqual([]);
    expect(c.allRequiredDone).toBe(true);
  });
});

describe("date helpers", () => {
  it("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-09-01", "2026-09-28")).toBe(27);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });
  it("freshnessWindow phrases months and days", () => {
    expect(freshnessWindow(90)).toBe("de los últimos 3 meses");
    expect(freshnessWindow(30)).toBe("del último mes");
    expect(freshnessWindow(45)).toBe("de los últimos 45 días");
  });
});
