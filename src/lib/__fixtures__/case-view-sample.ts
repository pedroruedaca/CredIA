/** A processed case for view/export tests and previews: the hand-checked TB, a CIRBE 85 k€ above the books, one review. */
import { checkCirbeVsBooks } from "../checks/engine.ts";
import type { CaseViewData } from "../case-view/load.ts";
import { computeKpis } from "../kpis/engine.ts";
import { buildStatement } from "../pgc/mapping.ts";
import type { CirbeExtraction } from "../schema/canonical.ts";
import { tbSmallSl } from "./tb-small-sl.ts";

const closed = buildStatement(tbSmallSl, { kind: "closed_fy", start: "2025-01-01", end: "2025-12-31" }).data;
const ytd = buildStatement(tbSmallSl, { kind: "ytd", start: "2026-01-01", end: "2026-08-31" }).data;
const cirbe: CirbeExtraction = {
  nif: "B12345674", asOf: "2025-12-31",
  positions: [140_000, 20_000, 60_000, 25_000].map((drawn, i) => ({ entity: `Banco ${i + 1}`, product: "préstamo", drawn, limit: null, overdue: 0, maturity: null, page: 2 })),
};
const checks = checkCirbeVsBooks(closed, cirbe, "c1").map((c, i) => ({ id: i + 1, check_key: c.key, status: c.status, severity: c.severity, message: c.message, evidence: c.evidence, source: "engine", document_id: "c1" }));

export const caseViewSample: CaseViewData = {
  kase: {
    id: "6f1c0a52-1111-4222-8333-944455556666", lenderName: "Fondo Ejemplo Capital", companyName: "Distribuciones Ejemplo, S.L.", cif: "B12345674", status: "ready",
    fiscalYearEnd: "2025-12-31", product: "poliza_circulante", amount: 250_000, termMonths: 24, borrowerEmail: null, linkExpiresAt: null, submittedAt: "2026-09-01T10:00:00Z",
    consentWithdrawnAt: null, processedAt: "2026-09-01T10:05:00Z", createdAt: "2026-08-20T10:00:00Z",
  },
  statements: { closed, ytd, closedSource: "upload", ytdSource: "upload" },
  kpis: { closed: computeKpis(closed), ytd: computeKpis(ytd) },
  checks,
  reviews: { cirbe_vs_books_debt: { status: "reviewed", note: "Préstamo ICO confirmado por la empresa.", at: "2026-09-02T09:00:00Z" } },
  documents: [
    { id: "c1", kind: "cirbe", original_filename: "cirbe.pdf", issued_on: "2026-08-31", status: "parsed", uploaded_at: "2026-09-01T09:00:00Z", attention_message: null, summary: null },
    { id: "t1", kind: "trial_balance", original_filename: "sys.xlsx", issued_on: null, status: "parsed", uploaded_at: "2026-09-01T09:00:00Z", attention_message: null, summary: null },
  ],
  requirements: [],
  cirbe,
  cirbeDocId: "c1",
  holded: null,
  activity: [],
  registry: { coverage: null, match: null, candidates: [], profile: null },
  registeredName: "Talleres Demo Levante, S.L.",
};

