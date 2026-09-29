"use client";

/**
 * Evidence for one open check, in a floating panel driven by ?check=<slug>. Headline delta, a two-bar
 * comparison, evidence rows (mismatches tinted), source pills, then the lender's review: internal note,
 * "Marcar revisada" and "Pedir aclaración" (append-only history in check_reviews).
 */
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewCheck } from "@/app/casos/[id]/actions";
import { Button } from "@/components/ui/Button";
import { Figure } from "@/components/ui/Figure";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { Pill, SourcePill } from "@/components/ui/Pill";
import { Textarea } from "@/components/ui/Input";
import { cx } from "@/components/ui/cx";
import { DISCLAIMER, REVIEW_LABEL, SEVERITY_LABEL } from "@/content/case-view.es";
import type { CasePackage } from "@/lib/case-view/package";
import { sourceHref } from "@/lib/case-view/present";
import { formatCompactEur, formatDate } from "@/lib/format";

type OpenView = CasePackage["open"][number];

const SEV_TONE = { high: "high", warn: "warn", info: "info" } as const;

function CompareBars({ bars }: { bars: NonNullable<OpenView["compare"]> }) {
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b) => {
        const base = Math.max(0, Math.abs(b.value) - (b.highlight ?? 0));
        return (
          <div key={b.label} className="flex items-center gap-2.5 text-xs text-muted">
            <span className="w-[84px] shrink-0">{b.label}</span>
            <div className="flex h-2.5 grow overflow-hidden rounded-full bg-soft-control" aria-hidden>
              <div className="h-full bg-chart-asset-2" style={{ width: `${(base / max) * 100}%` }} />
              {b.highlight ? <div className="h-full bg-high-dot" style={{ width: `${(b.highlight / max) * 100}%` }} /> : null}
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-ink">{formatCompactEur(b.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewForm({ caseId, view, canEdit }: { caseId: string; view: OpenView; canEdit: boolean }) {
  const [note, setNote] = useState(view.review?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = view.review?.status ?? "open";

  const submit = (status: "open" | "reviewed" | "clarification_requested") =>
    start(async () => {
      setError(null);
      const r = await reviewCheck({ caseId, checkKey: view.slug, status, note });
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-2.5">
      {view.review && current !== "open" && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <Pill tone={current === "reviewed" ? "ok" : "info"}>{REVIEW_LABEL[current]}</Pill>
          {formatDate(view.review.at)}
        </p>
      )}
      {canEdit ? (
        <>
          <label htmlFor={`nota-${view.slug}`} className="text-[13px] text-muted">Nota interna</label>
          <Textarea id={`nota-${view.slug}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Añade una nota para el comité…" className="resize-none" />
          <div className="flex gap-2">
            {current === "open" ? (
              <>
                <Button variant="secondary" className="grow" disabled={pending} onClick={() => submit("reviewed")}>Marcar revisada</Button>
                <Button className="grow" disabled={pending} onClick={() => submit("clarification_requested")}>Pedir aclaración</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className="grow" disabled={pending} onClick={() => submit("open")}>Reabrir</Button>
                <Button className="grow" disabled={pending || note === (view.review?.note ?? "")} onClick={() => submit(current)}>Guardar nota</Button>
              </>
            )}
          </div>
          {error && <p role="alert" className="text-[13px] text-high">{error}</p>}
        </>
      ) : (
        view.review?.note && <p className="rounded-row bg-soft px-3.5 py-3 text-sm">{view.review.note}</p>
      )}
    </div>
  );
}

export function EvidencePanel({ caseId, views, selected, canEdit }: { caseId: string; views: OpenView[]; selected: string | null; canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const view = views.find((v) => v.slug === selected) ?? null;
  const close = () => router.replace(pathname, { scroll: false });

  return (
    <FloatingPanel
      open={view !== null}
      onClose={close}
      title={
        view && (
          <div className="flex items-center gap-2.5">
            <Pill tone={SEV_TONE[view.severity]}>{SEVERITY_LABEL[view.severity]}</Pill>
            <h2 className="truncate text-[13px] font-normal text-muted">{view.name}</h2>
          </div>
        )
      }
    >
      {view && (
        <div key={view.slug} className="flex min-h-full flex-col gap-6">
          {view.headline ? (
            <div className="flex flex-col gap-1">
              <div className="text-[40px] font-medium leading-none">
                {view.headline.signed && view.headline.value > 0 && <span className="font-mono tracking-[-0.04em]">+</span>}
                <Figure value={view.headline.value} unit={view.headline.unit} decimals={0} className="tracking-[-0.04em]" />
              </div>
              <p className="text-sm text-ink-2">{view.headline.caption}</p>
            </div>
          ) : null}
          <p className={cx("leading-normal", view.headline ? "text-sm text-ink-2" : "text-[15px] text-ink")}>{view.message}</p>

          {view.compare && <CompareBars bars={view.compare} />}

          {view.table && (
            <div className="flex flex-col">
              <div className="flex pb-2 text-xs text-muted">
                <span className="grow">{view.table.columns[0]}</span>
                {view.table.columns.slice(1).map((c) => <span key={c} className="w-[84px] text-right">{c}</span>)}
              </div>
              {view.table.rows.map((r, i) => (
                <div key={i} className={cx("flex items-center py-2.5 text-sm", r.mismatch ? "-mx-3 my-0.5 rounded-xl bg-high-bg px-3" : "border-t border-hairline")}>
                  <span className={cx("grow", r.mono && "font-mono", r.mismatch && "font-medium")}>{r.label}</span>
                  <span className="w-[84px] text-right font-mono tabular-nums">{r.a}</span>
                  {r.b !== undefined && <span className={cx("w-[84px] text-right font-mono tabular-nums", r.mismatch ? "text-high" : "text-ink-2")}>{r.b}</span>}
                </div>
              ))}
            </div>
          )}

          {view.values.length > 0 && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
              {view.values.map((v, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{v.label}</dt>
                  <dd className="text-right font-mono tabular-nums">{v.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view.rule && <p className="text-xs text-muted">Regla: {view.rule}</p>}

          {view.sourceLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {view.sourceLabels.map((s) => <SourcePill key={s.label} href={sourceHref(caseId, s.docId, s.page)}>{s.label}</SourcePill>)}
              {view.moreSources > 0 && <SourcePill>+{view.moreSources}</SourcePill>}
            </div>
          )}
          {view.gaps.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-muted">
              {view.gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}

          <div className="grow" />
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 bg-surface px-6 pb-6 pt-3">
            <ReviewForm caseId={caseId} view={view} canEdit={canEdit} />
            <p className="text-[11px] leading-snug text-muted">{DISCLAIMER}</p>
          </div>
        </div>
      )}
    </FloatingPanel>
  );
}
