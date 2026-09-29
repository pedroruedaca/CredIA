/** Pure decisions the orchestrator makes when rebuilding a case. */
import { periodsFor } from "../connectors/holded-sync.ts";
import type { N43Account } from "../parsers/norma43.ts";
import type { Period, Warning } from "../types.ts";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export interface UploadedTb {
  docId: string;
  uploadedAt: string;
  fileName: string;
  detected: { start: string; end: string } | null;
}

export interface TbAssignment {
  docId: string;
  period: Period | null; // null: not used (an older year)
  warnings: Warning[];
}

/**
 * Decides which period each uploaded trial balance covers, from the dates printed in it and the case's
 * fiscal-year end. Undated files fill the closed year first, then the current year (with a warning, because
 * a wrong guess distorts annualised KPIs). The newest file wins when two cover the same period.
 */
export function assignTbPeriods(tbs: UploadedTb[], fiscalYearEnd: string, today: string): TbAssignment[] {
  const [closed, ytdDefault] = periodsFor(fiscalYearEnd, today);
  const out: TbAssignment[] = [];
  const taken = new Set<string>();
  const newestFirst = [...tbs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const claim = (t: UploadedTb, period: Period, warnings: Warning[]) => {
    if (taken.has(period.kind)) {
      out.push({ docId: t.docId, period: null, warnings: [{ code: "tb_superseded", message: `«${t.fileName}» cubre el mismo periodo que un fichero más reciente; se usa el más reciente.` }] });
      return;
    }
    taken.add(period.kind);
    out.push({ docId: t.docId, period, warnings });
  };

  for (const t of newestFirst.filter((x) => x.detected)) {
    const d = t.detected!;
    if (Math.abs(day(d.end) - day(closed.end)) <= 5) claim(t, closed, []);
    else if (day(d.end) > day(closed.end)) claim(t, { kind: "ytd", start: d.start > closed.end ? d.start : ytdDefault?.start ?? d.start, end: d.end }, []);
    else {
      out.push({
        docId: t.docId,
        period: null,
        warnings: [{ code: "tb_prior_year", message: `«${t.fileName}» es de un ejercicio anterior (${d.start} a ${d.end}); no se usa.`, detail: { start: d.start, end: d.end } }],
      });
    }
  }
  // Undated files: oldest upload first fills the closed year, the next one the current year.
  for (const t of [...tbs].filter((x) => !x.detected).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) {
    const target = !taken.has("closed_fy") ? closed : ytdDefault && !taken.has("ytd") ? ytdDefault : null;
    if (!target) {
      out.push({ docId: t.docId, period: null, warnings: [{ code: "tb_superseded", message: `«${t.fileName}» no tiene fechas y ya hay balances para los dos periodos; no se usa.` }] });
      continue;
    }
    claim(t, target, [
      {
        code: "tb_period_assumed",
        message: `«${t.fileName}» no indica fechas: se ha tomado como ${target.kind === "closed_fy" ? "ejercicio cerrado" : "año en curso"} (${target.start} a ${target.end}). Revisa el periodo antes de usar los ratios anualizados.`,
        detail: { start: target.start, end: target.end },
      },
    ]);
  }
  return out;
}

/** Per period, the newest source wins: an upload made after a Holded sync replaces it, and vice versa. */
export function chooseSource(uploadAt: string | null, holdedAt: string | null): "upload" | "holded" | null {
  if (uploadAt && holdedAt) return uploadAt > holdedAt ? "upload" : "holded";
  return uploadAt ? "upload" : holdedAt ? "holded" : null;
}

/** The same bank account and period uploaded twice would double-count: keep the newest file's copy. */
export function dedupeBankAccounts(docs: { docId: string; uploadedAt: string; accounts: N43Account[] }[]) {
  const seen = new Set<string>();
  const kept: { docId: string; account: N43Account }[] = [];
  for (const d of [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))) {
    for (const a of d.accounts) {
      const key = `${a.accountMasked}|${a.start}|${a.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push({ docId: d.docId, account: a });
    }
  }
  return kept;
}
