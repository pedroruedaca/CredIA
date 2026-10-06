/**
 * Cost of sales for the adjusted gross margin: the analyst ticks which costs are direct for this company (lines, PGC
 * groups, subaccounts or model lines), starting from a preset. The accounting gross margin stays as it is.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CostOfSalesEditor, type OptionSource } from "@/components/case/CostOfSalesEditor";
import { loadCaseView } from "@/lib/case-view/load";
import { describeSource, sourceHref } from "@/lib/case-view/present";
import { costOptions, descendants, PRESET_LABEL, selectorLabel } from "@/lib/kpis/cost-of-sales";
import { isFullStatement } from "@/lib/pgc/mapping";
import { caseRef, formatDate } from "@/lib/format";
import { requireLender } from "@/lib/lender";
import { logCaseRead } from "@/lib/lender-audit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coste de ventas · credIA", robots: { index: false, follow: false } };

export default async function CostOfSalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lender = await requireLender();
  const db = await createClient();
  const data = await loadCaseView(db, id);
  if (!data) notFound();
  await logCaseRead(db, lender, id, "case.cost_of_sales_viewed");

  const statements = [data.statements.closed, data.statements.ytd].filter(isFullStatement).filter((s) => s.pnlAvailable);
  const options = costOptions(statements, data.accountNames);
  // Where each subaccount or model line comes from, worded for a pill.
  const sources: Record<string, OptionSource> = {};
  for (const { option } of options) {
    for (const o of [option, ...option.children, ...option.children.flatMap((c) => c.children)]) {
      if (!o.sourceRef) continue;
      const s = describeSource(o.sourceRef, data.documents);
      sources[o.selector] = { label: s.label, href: sourceHref(id, s.docId, s.page, s.url) ?? null };
    }
  }
  const columns = statements.map((s) => ({ kind: s.period.kind, label: s.period.kind === "closed_fy" ? `Cierre ${formatDate(s.period.end)}` : `YTD ${formatDate(s.period.end)}` }));

  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
        <Link href="/casos" className="text-muted hover:text-ink">Casos</Link>
        <span aria-hidden>/</span>
        <Link href={`/casos/${id}`} className="font-mono text-muted hover:text-ink">{caseRef(id)}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">Coste de ventas</span>
      </nav>
      <h1 className="mt-3.5 heading-page">Coste de ventas</h1>
      <p className="mt-2 max-w-[640px] text-[15px] text-ink-2">
        El margen bruto contable solo resta los aprovisionamientos (60, 61). Marca los costes que son directos para {data.kase.companyName}: el margen
        bruto ajustado se muestra junto al contable, como criterio del analista.
      </p>
      {statements.length === 0 ? (
        <div className="mt-10 flex flex-col gap-2">
          <p className="text-[15px] text-ink-2">Aún no hay cuenta de resultados procesada para este caso: podrás marcar sus cuentas cuando llegue.</p>
          {data.costOfSales && (
            <p className="text-[15px] text-ink-2">
              {data.costOfSales.source === "template" ? "Criterio de la plantilla" : "Criterio del analista"}: <b className="font-semibold text-ink">{PRESET_LABEL[data.costOfSales.definition.preset]}</b>
              {" · "}
              {data.costOfSales.definition.selectors.map((s) => selectorLabel(s, data.accountNames)).join(", ")}
            </p>
          )}
        </div>
      ) : (
        <CostOfSalesEditor
          caseId={id}
          canEdit={lender.role !== "viewer"}
          statements={statements}
          options={options}
          order={options.flatMap((o) => [o.option.selector, ...descendants(o.option)])}
          columns={columns}
          sources={sources}
          initial={data.costOfSales?.definition ?? null}
          initialSource={data.costOfSales?.source ?? null}
          ledgerDetail={options.some((o) => o.option.children.some((c) => /^\d+$/.test(c.selector)))}
        />
      )}
    </main>
  );
}
