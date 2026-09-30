/** Full balance sheet and P&L for the closed year and YTD, each line expandable to its accounts and sources. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SourcePill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { loadCaseView } from "@/lib/case-view/load";
import { describeSource, formatAccount, isAccountCode, sourceHref, type SourceDoc } from "@/lib/case-view/present";
import { statementTables, type TableRow } from "@/lib/case-view/tables";
import { caseRef, formatDate, formatEurWhole } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { logCaseRead } from "@/lib/lender-audit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tablas · credIA", robots: { index: false, follow: false } };

const eur = formatEurWhole;

function Table({ title, rows, columns, caseId, docs }: { title: string; rows: TableRow[]; columns: string[]; caseId: string; docs: SourceDoc[] }) {
  const grid = columns.length === 2 ? "grid-cols-[minmax(0,1fr)_110px_110px]" : "grid-cols-[minmax(0,1fr)_110px]";
  return (
    <section aria-label={title} className="flex flex-col">
      <div className={cx("grid items-baseline gap-x-4 pb-2 text-xs text-muted", grid)}>
        <h2 className="heading-section text-ink">{title}</h2>
        {columns.map((c) => <span key={c} className="text-right">{c}</span>)}
      </div>
      {rows.map((r) => {
        const accounts = r.accounts.flat();
        const cells = r.values.map((v, i) => (
          <span key={i} className={cx("text-right font-mono tabular-nums", r.kind === "memo" && "text-muted")}>{v === null ? "—" : eur(v)}</span>
        ));
        const rowCls = cx(
          "grid items-center gap-x-4 py-2.5 text-sm",
          grid,
          r.kind === "line" || r.kind === "memo" ? "border-t border-hairline" : "rounded-xl bg-soft px-3 -mx-3 my-1 font-medium",
          r.kind === "total" && "font-semibold",
        );
        if (accounts.length === 0) {
          return (
            <div key={r.key} className={rowCls}>
              <span className={cx(r.kind === "memo" && "pl-4 text-muted")}>{r.label.trim()}</span>
              {cells}
            </div>
          );
        }
        return (
          <details key={r.key} className="group border-t border-hairline">
            <summary className={cx(rowCls, "cursor-pointer list-none border-0 hover:bg-soft [&::-webkit-details-marker]:hidden")}>
              <span className="flex items-center gap-2">
                <ChevronRight size={14} strokeWidth={2} aria-hidden className="text-faint transition-transform duration-150 group-open:rotate-90" />
                {r.label}
              </span>
              {cells}
            </summary>
            <ul className="mb-2 flex flex-col gap-1 pl-5">
              {r.accounts.map((list, col) =>
                list.map((c, i) => {
                  const src = describeSource(c.sourceRef, docs);
                  return (
                    <li key={`${col}-${i}`} className={cx("grid items-center gap-x-4 text-[13px] text-ink-2", grid)}>
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={isAccountCode(c.account) ? "font-mono" : undefined}>{formatAccount(c.account)}</span>
                        <SourcePill href={sourceHref(caseId, src.docId, src.page)} className="min-h-6 px-2 text-[11px]">{src.label}</SourcePill>
                      </span>
                      {columns.map((_, j) => <span key={j} className="text-right font-mono tabular-nums">{j === col ? eur(c.amount) : ""}</span>)}
                    </li>
                  );
                }),
              )}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

export default async function TablasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lender = await requireLender();
  const db = await createClient();
  const data = await loadCaseView(db, id);
  if (!data) notFound();
  await logCaseRead(db, lender, id, "case.tables_viewed");
  const { closed, ytd } = data.statements;
  const statements = [closed, ytd].filter((s) => s !== null);
  const columns = statements.map((s) => (s.period.kind === "closed_fy" ? `Cierre ${formatDate(s.period.end)}` : `YTD ${formatDate(s.period.end)}`));
  const t = statementTables(statements);

  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
        <Link href="/casos" className="text-muted hover:text-ink">Casos</Link>
        <span aria-hidden>/</span>
        <Link href={`/casos/${id}`} className="font-mono text-muted hover:text-ink">{caseRef(id)}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">Tablas</span>
      </nav>
      <h1 className="mt-3.5 heading-page">{data.kase.companyName}</h1>
      <p className="mt-2 text-[15px] text-ink-2">Balance y cuenta de resultados agrupados por código PGC de 3 dígitos. Despliega una línea para ver sus cuentas y su origen.</p>
      {statements.length === 0 ? (
        <p className="mt-10 text-[15px] text-ink-2">Aún no hay contabilidad procesada.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          <Table title="Activo" rows={t.assets} columns={columns} caseId={id} docs={data.documents} />
          <Table title="Patrimonio neto y pasivo" rows={t.liabilities} columns={columns} caseId={id} docs={data.documents} />
          {t.pnl.length > 0 ? (
            <Table title="Cuenta de resultados" rows={t.pnl} columns={columns} caseId={id} docs={data.documents} />
          ) : (
            <p className="text-[15px] text-ink-2">Sin cuenta de resultados en los periodos disponibles.</p>
          )}
          {statements.some((s) => s.months !== 12) && <p className="text-xs text-muted">Los importes de YTD son del periodo, sin anualizar.</p>}
        </div>
      )}
      <Link href={`/casos/${id}`} className="mt-10 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"><ArrowLeft size={16} aria-hidden /> Volver al caso</Link>
    </main>
  );
}
