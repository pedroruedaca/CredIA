/**
 * The tools «Preguntar al caso» answers with. Pure: they read the case as the lender's view loads it (RLS client) and
 * the case's bank movements, and return compact JSON in which every figure carries a citation handle (`ref`)
 * registered in the conversation's RefRegistry with its label, value and source_ref.
 *
 * Read-only and descriptive, like the rest of credIA: no tool scores, ranks or recommends. Arithmetic the answer
 * needs goes through `compute`, over figures a tool already returned, so a derived number has a derivation.
 * Text fields that come from documents (bank concepts, BORME acts, report descriptions) are marked as untrusted data.
 */
import * as z from "zod/v4";
import { BANK_CATEGORY_LABEL, KPI_LABEL, REVIEW_LABEL, SEVERITY_LABEL, VALUE_LABEL } from "../../content/case-view.es.ts";
import { PROVIDER_FIGURES_NOTE } from "../../content/solvency.es.ts";
import { INFLOW_CATEGORIES, NEUTRAL_CATEGORIES, OUTFLOW_CATEGORIES } from "../bank/classify.ts";
import type { CaseViewData } from "../case-view/load.ts";
import type { CasePackage } from "../case-view/package.ts";
import { describeSource, sourceHref } from "../case-view/present.ts";
import { statementTables, type TableRow } from "../case-view/tables.ts";
import type { Kpi } from "../kpis/engine.ts";
import type { CanonicalStatement } from "../pgc/mapping.ts";
import { evaluate } from "./calc.ts";
import { refHandle, type RefEntry, type RefRegistry } from "./refs.ts";

/** One row of `bank_transactions` (the case's classified bank movements, own accounts only). */
export interface BankRow {
  booking_date: string;
  amount: number;
  description: string | null;
  category: string | null;
  iban_masked: string | null;
  source_ref: string;
}

export interface ToolContext {
  data: CaseViewData;
  pkg: CasePackage;
  registry: RefRegistry;
  /** Loaded on first use: most questions never touch the movements. */
  bankRows: () => Promise<BankRow[]>;
}

export type ToolOutput = { ok: true; result: unknown; refs: string[] } | { ok: false; error: string };

const PERIOD = z.enum(["closed_fy", "ytd"]);
const CATEGORIES = [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES, ...NEUTRAL_CATEGORIES] as const;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const BankFilter = {
  from: DATE.optional().describe("First booking date included (YYYY-MM-DD)."),
  to: DATE.optional().describe("Last booking date included (YYYY-MM-DD)."),
  direction: z.enum(["in", "out"]).optional().describe("in = money received (amount > 0), out = money paid (amount < 0)."),
  categories: z.array(z.enum(CATEGORIES)).max(20).optional().describe("Only these categories. Own transfers (internal_transfer) are usually excluded when talking about sales or costs."),
  exclude_categories: z.array(z.enum(CATEGORIES)).max(20).optional().describe("Leave these categories out."),
  text: z.string().max(80).optional().describe("Case-insensitive text the bank concept must contain."),
  account: z.string().max(40).optional().describe("Masked IBAN as returned by a previous call."),
  min_abs: z.number().min(0).optional().describe("Minimum absolute amount in euros."),
  max_abs: z.number().min(0).optional().describe("Maximum absolute amount in euros."),
};

export const TOOL_SCHEMAS = {
  get_statements: z.object({
    period: z.enum(["closed_fy", "ytd", "both"]).default("both").describe("closed_fy = last closed fiscal year, ytd = current year to date."),
    section: z.enum(["balance", "pnl", "all"]).default("all"),
    with_accounts: z.boolean().default(false).describe("Include the ledger accounts or model lines behind each line, each with its own ref."),
  }),
  get_kpis: z.object({
    period: z.enum(["closed_fy", "ytd", "bank", "all"]).default("all").describe("bank = indicators read from the bank movements (last 12 months)."),
  }),
  get_checks: z.object({
    status: z.enum(["open", "passed", "all"]).default("all"),
  }),
  search_bank_movements: z.object({
    ...BankFilter,
    order: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc", "abs_desc"]).default("date_desc"),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  aggregate_bank_movements: z.object({
    ...BankFilter,
    group_by: z.enum(["month", "category", "account", "none"]).default("month"),
  }),
  get_debt_positions: z.object({}),
  get_registry: z.object({}),
  get_solvency_report: z.object({}),
  compute: z.object({
    expression: z.string().min(1).max(300).describe("Arithmetic over the operand names: + - * / and parentheses, e.g. \"(a - b) / b * 100\"."),
    operands: z.record(z.string().regex(/^[a-z_][a-z0-9_]*$/i), z.string().regex(/^r[a-z0-9]{1,15}$/)).describe("Operand name → ref of a figure a tool returned in this conversation."),
    label: z.string().min(1).max(120).describe("What the result is, in Spanish, e.g. \"Variación de ventas cierre frente a YTD anualizado\"."),
    unit: z.enum(["EUR", "%", "x", "days", "count"]),
  }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

const DESCRIPTIONS: Record<ToolName, string> = {
  get_statements:
    "Balance sheet and income statement lines (euros) for the closed fiscal year and/or the year to date, as credIA normalised them (PGC). Each line has a ref; with_accounts adds the accounts behind each line with their own refs. Expenses are negative. YTD figures are not annualised.",
  get_kpis:
    "Financial indicators computed by credIA with value, unit, formula, inputs and notes (null value = not computable, with the reason). Periods: closed_fy, ytd (flows not annualised unless the formula says so), bank (from bank movements, last 12 months).",
  get_checks:
    "credIA's cross-checks (open = failed and needing review, passed = consistent): severity, message, rule, evidence values, the analyst's review and the sources.",
  search_bank_movements:
    "Individual bank movements of the company's own accounts (classified), filtered and sorted, at most 50 rows, plus the matched count and total. Use aggregate_bank_movements for sums by month/category.",
  aggregate_bank_movements:
    "Sums and counts of bank movements grouped by month, category or account (or one total), with the same filters as search_bank_movements. Inflows are positive, outflows negative.",
  get_debt_positions: "CIRBE (Banco de España) debt positions by bank and product: drawn, limit, overdue, maturity, and totals.",
  get_registry: "Registro Mercantil (BORME) profile of the company, only if the lender confirmed the match: registry sheet, officers, capital and published acts.",
  get_solvency_report:
    "The latest commercial credit report (informe de solvencia) uploaded: payment incidents, judicial items, financial figures, and the provider's own rating / default probability / credit limit (attributed to the provider, never credIA's).",
  compute:
    "Evaluates arithmetic over figures that tools already returned (by their ref) and registers the result with its own ref. Use it for every derived number: differences, ratios, shares, growth, annualisation.",
};

/** Tool definitions for the Messages API, in a fixed order (part of the cached prefix). */
export function toolDefinitions() {
  return (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(TOOL_SCHEMAS[name], { io: "input" }) as Record<string, unknown>;
    return { name, description: DESCRIPTIONS[name], input_schema: { ...schema, type: "object" as const } };
  });
}

/** What the chat shows while a tool runs. */
export const TOOL_STATUS: Record<ToolName, string> = {
  get_statements: "Leyendo el balance y la cuenta de resultados",
  get_kpis: "Leyendo los indicadores",
  get_checks: "Leyendo las verificaciones",
  search_bank_movements: "Buscando movimientos bancarios",
  aggregate_bank_movements: "Sumando movimientos bancarios",
  get_debt_positions: "Leyendo la CIRBE",
  get_registry: "Leyendo el Registro Mercantil",
  get_solvency_report: "Leyendo el informe de solvencia",
  compute: "Calculando",
};

// ---------------------------------------------------------------------------------------------------------------

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const periodLabel = (s: CanonicalStatement) => (s.period.kind === "closed_fy" ? `cierre ${s.period.end}` : `YTD ${s.period.start}..${s.period.end}`);
const untrusted = (s: string | null | undefined, max = 160) => (s ? s.slice(0, max) : null);

/** Registers and returns the handle; collects it for the tool's trace. */
function reg(ctx: ToolContext, refs: string[], e: RefEntry): string {
  const h = ctx.registry.add(e);
  refs.push(h);
  return h;
}

const sourceEntry = (ctx: ToolContext, sourceRef: string) => {
  const s = describeSource(sourceRef, ctx.data.documents);
  return { label: s.label, sourceRef, href: sourceHref(ctx.data.kase.id, s.docId, s.page, s.url) ?? null };
};

function getStatements(ctx: ToolContext, input: z.infer<(typeof TOOL_SCHEMAS)["get_statements"]>, refs: string[]) {
  const { closed, ytd, closedSource, ytdSource } = ctx.data.statements;
  const statements = (input.period === "both" ? [closed, ytd] : input.period === "closed_fy" ? [closed] : [ytd]).filter((s) => s !== null);
  if (!statements.length) return { periods: [], note: "No hay estados financieros para ese periodo en este caso." };
  const t = statementTables(statements);
  const sections: Record<string, TableRow[]> = input.section === "balance" ? { assets: t.assets, equity_and_liabilities: t.liabilities } : input.section === "pnl" ? { pnl: t.pnl } : { assets: t.assets, equity_and_liabilities: t.liabilities, pnl: t.pnl };
  return {
    periods: statements.map((s) => ({
      period: s.period.kind,
      start: s.period.start,
      end: s.period.end,
      months: s.months,
      source: s.period.kind === "closed_fy" ? closedSource : ytdSource,
      scope: s.scope === "revenue" ? "revenue_only (Modelo 303: only sales are known)" : "full",
    })),
    ...Object.fromEntries(
      Object.entries(sections).map(([name, rows]) => [
        name,
        rows.map((r) => ({
          line: r.key,
          label: r.label.trim(),
          kind: r.kind,
          values: Object.fromEntries(
            statements.map((s, i) => {
              const v = r.values[i];
              if (v === null) return [s.period.kind, null];
              const ref = reg(ctx, refs, { id: `line:${s.period.kind}:${r.key}`, label: `${r.label.trim()} · ${periodLabel(s)}`, value: v, unit: "EUR", href: `/casos/${ctx.data.kase.id}/tablas` });
              return [s.period.kind, { value: round(v), ref }];
            }),
          ),
          ...(input.with_accounts
            ? {
                accounts: Object.fromEntries(
                  statements.map((s, i) => [
                    s.period.kind,
                    (r.accounts[i] ?? []).slice(0, 40).map((c) => ({
                      account: c.account,
                      name: ctx.data.accountNames[c.account] ?? null,
                      amount: round(c.amount),
                      ref: reg(ctx, refs, { id: `acct:${s.period.kind}:${r.key}:${c.account}:${c.sourceRef}`, value: c.amount, unit: "EUR", ...sourceEntry(ctx, c.sourceRef), label: `${sourceEntry(ctx, c.sourceRef).label} · ${c.account} · ${periodLabel(s)}` }),
                    })),
                  ]),
                ),
              }
            : {}),
        })),
      ]),
    ),
  };
}

function kpiRows(ctx: ToolContext, refs: string[], period: "closed_fy" | "ytd" | "bank", kpis: Kpi[], where: string) {
  return kpis.map((k) => ({
    key: k.key,
    label: KPI_LABEL[k.key] ?? k.key,
    value: k.value === null ? null : round(k.value, 4),
    unit: k.unit,
    formula: k.formula,
    inputs: Object.fromEntries(Object.entries(k.inputs).map(([key, v]) => [VALUE_LABEL[key] ?? key, round(v)])),
    note: k.note ?? null,
    ref: k.value === null ? null : reg(ctx, refs, { id: `kpi:${period}:${k.key}`, label: `${KPI_LABEL[k.key] ?? k.key} · ${where}`, value: k.value, unit: k.unit === "count" ? "count" : k.unit }),
  }));
}

function getKpis(ctx: ToolContext, input: z.infer<(typeof TOOL_SCHEMAS)["get_kpis"]>, refs: string[]) {
  const { closed, ytd } = ctx.data.statements;
  const out: Record<string, unknown> = {};
  if ((input.period === "closed_fy" || input.period === "all") && closed) out.closed_fy = { period: `${closed.period.start}..${closed.period.end}`, kpis: kpiRows(ctx, refs, "closed_fy", ctx.data.kpis.closed, periodLabel(closed)) };
  if ((input.period === "ytd" || input.period === "all") && ytd) out.ytd = { period: `${ytd.period.start}..${ytd.period.end}`, months: ytd.months, kpis: kpiRows(ctx, refs, "ytd", ctx.data.kpis.ytd, periodLabel(ytd)) };
  if ((input.period === "bank" || input.period === "all") && ctx.data.bank) {
    const b = ctx.data.bank;
    out.bank = { period: `${b.period.start}..${b.period.end}`, accounts: b.accounts, coverage_note: b.coverageNote, kpis: kpiRows(ctx, refs, "bank", b.kpis, `bancos ${b.period.start}..${b.period.end}`) };
  }
  return Object.keys(out).length ? out : { note: "No hay indicadores para ese periodo en este caso." };
}

function getChecks(ctx: ToolContext, input: z.infer<(typeof TOOL_SCHEMAS)["get_checks"]>, refs: string[]) {
  const row = (v: CasePackage["passed"][number], review: CaseViewData["reviews"][string] | null) => ({
    id: v.slug,
    name: v.name,
    status: v.status === "fail" ? "open" : v.status === "pass" ? "passed" : "not_applicable",
    severity: SEVERITY_LABEL[v.severity],
    message: v.message,
    rule: v.rule,
    values: Object.fromEntries(v.values.map((x) => [x.label, x.value])),
    review: review && review.status !== "open" ? { status: REVIEW_LABEL[review.status], note: review.note, at: review.at } : null,
    ref: reg(ctx, refs, { id: `check:${v.slug}`, label: `Verificación · ${v.name}`, href: `/casos/${ctx.data.kase.id}?check=${encodeURIComponent(v.slug)}` }),
    sources: v.sources.slice(0, 12).map((s) => ({ label: describeSource(s, ctx.data.documents).label, ref: reg(ctx, refs, { id: s, ...sourceEntry(ctx, s) }) })),
  });
  return {
    open: input.status === "passed" ? undefined : ctx.pkg.open.map((v) => row(v, v.review)),
    passed: input.status === "open" ? undefined : ctx.pkg.passed.map((v) => row(v, null)),
  };
}

type Filter = z.infer<(typeof TOOL_SCHEMAS)["aggregate_bank_movements"]>;

function filterRows(rows: BankRow[], f: Partial<Filter>): BankRow[] {
  const text = f.text?.toLocaleLowerCase("es");
  return rows.filter((r) =>
    (!f.from || r.booking_date >= f.from) &&
    (!f.to || r.booking_date <= f.to) &&
    (!f.direction || (f.direction === "in" ? r.amount > 0 : r.amount < 0)) &&
    (!f.categories?.length || f.categories.includes(r.category as never)) &&
    (!f.exclude_categories?.length || !f.exclude_categories.includes(r.category as never)) &&
    (!text || (r.description ?? "").toLocaleLowerCase("es").includes(text)) &&
    (!f.account || r.iban_masked === f.account) &&
    (f.min_abs === undefined || Math.abs(r.amount) >= f.min_abs) &&
    (f.max_abs === undefined || Math.abs(r.amount) <= f.max_abs),
  );
}

/** The filter in words, for the label of a sum. */
function filterText(f: Partial<Filter>): string {
  const parts = [
    f.direction === "in" ? "entradas" : f.direction === "out" ? "salidas" : null,
    f.categories?.length ? f.categories.map((c) => BANK_CATEGORY_LABEL[c] ?? c).join(", ") : null,
    f.exclude_categories?.length ? `sin ${f.exclude_categories.map((c) => BANK_CATEGORY_LABEL[c] ?? c).join(", ")}` : null,
    f.text ? `concepto «${f.text}»` : null,
    f.account ? `cuenta ${f.account}` : null,
    f.from || f.to ? `${f.from ?? "…"}..${f.to ?? "…"}` : null,
    f.min_abs !== undefined ? `≥ ${f.min_abs} €` : null,
    f.max_abs !== undefined ? `≤ ${f.max_abs} €` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "todos los movimientos";
}

const filterKey = (f: Partial<Filter>) => refHandle(JSON.stringify(Object.entries(f).filter(([k, v]) => v !== undefined && k !== "order" && k !== "limit").sort()));

function coverage(rows: BankRow[]) {
  if (!rows.length) return null;
  const dates = rows.map((r) => r.booking_date).sort();
  return { from: dates[0], to: dates.at(-1), accounts: [...new Set(rows.map((r) => r.iban_masked ?? "—"))] };
}

async function searchBank(ctx: ToolContext, input: z.infer<(typeof TOOL_SCHEMAS)["search_bank_movements"]>, refs: string[]) {
  const all = await ctx.bankRows();
  if (!all.length) return { note: "Este caso no tiene movimientos bancarios (Norma 43 o extractos que cuadren)." };
  const rows = filterRows(all, input);
  const sorted = [...rows].sort((a, b) =>
    input.order === "date_asc" ? a.booking_date.localeCompare(b.booking_date)
    : input.order === "amount_desc" ? b.amount - a.amount
    : input.order === "amount_asc" ? a.amount - b.amount
    : input.order === "abs_desc" ? Math.abs(b.amount) - Math.abs(a.amount)
    : b.booking_date.localeCompare(a.booking_date),
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const where = filterText(input);
  return {
    coverage: coverage(all),
    matched: rows.length,
    total: { value: round(total), ref: reg(ctx, refs, { id: `bank:sum:${filterKey(input)}`, label: `Movimientos bancarios · ${where} · suma de ${rows.length}`, value: total, unit: "EUR" }) },
    rows: sorted.slice(0, input.limit).map((r) => ({
      date: r.booking_date,
      amount: round(r.amount),
      category: r.category ? `${r.category} (${BANK_CATEGORY_LABEL[r.category] ?? r.category})` : null,
      account: r.iban_masked,
      concept_untrusted: untrusted(r.description),
      ref: reg(ctx, refs, { id: r.source_ref, value: r.amount, unit: "EUR", ...sourceEntry(ctx, r.source_ref), label: `${sourceEntry(ctx, r.source_ref).label} · ${r.booking_date}` }),
    })),
    truncated: rows.length > input.limit,
  };
}

async function aggregateBank(ctx: ToolContext, input: Filter, refs: string[]) {
  const all = await ctx.bankRows();
  if (!all.length) return { note: "Este caso no tiene movimientos bancarios (Norma 43 o extractos que cuadren)." };
  const rows = filterRows(all, input);
  const keyOf = (r: BankRow) => (input.group_by === "month" ? r.booking_date.slice(0, 7) : input.group_by === "category" ? (r.category ?? "sin_categoría") : input.group_by === "account" ? (r.iban_masked ?? "—") : "total");
  const groups = new Map<string, { count: number; inflows: number; outflows: number }>();
  for (const r of rows) {
    const g = groups.get(keyOf(r)) ?? { count: 0, inflows: 0, outflows: 0 };
    g.count++;
    if (r.amount > 0) g.inflows += r.amount;
    else g.outflows += r.amount;
    groups.set(keyOf(r), g);
  }
  const where = filterText(input);
  const fk = filterKey(input);
  const keyLabel = (k: string) => (input.group_by === "category" ? (BANK_CATEGORY_LABEL[k] ?? k) : k === "total" ? "total" : k);
  const fig = (id: string, label: string, value: number) => ({ value: round(value), ref: reg(ctx, refs, { id, label, value, unit: "EUR" }) });
  return {
    coverage: coverage(all),
    filter: where,
    groups: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, g]) => ({
        key: k,
        label: keyLabel(k),
        count: g.count,
        net: fig(`bank:agg:${fk}:${input.group_by}:${k}:net`, `Movimientos bancarios · ${where} · ${keyLabel(k)} · neto`, g.inflows + g.outflows),
        inflows: fig(`bank:agg:${fk}:${input.group_by}:${k}:in`, `Movimientos bancarios · ${where} · ${keyLabel(k)} · entradas`, g.inflows),
        outflows: fig(`bank:agg:${fk}:${input.group_by}:${k}:out`, `Movimientos bancarios · ${where} · ${keyLabel(k)} · salidas`, g.outflows),
      })),
  };
}

function getDebt(ctx: ToolContext, refs: string[]) {
  const c = ctx.data.cirbe;
  if (!c) return { note: "No hay CIRBE leída en este caso." };
  const doc = ctx.data.cirbeDocId;
  const at = (page: number) => (doc ? sourceEntry(ctx, `doc:${doc}:page:${page}`) : { label: "CIRBE", sourceRef: null, href: null });
  const fig = (id: string, label: string, value: number, page: number) => ({ value: round(value), ref: reg(ctx, refs, { id, value, unit: "EUR", ...at(page), label }) });
  const total = (k: "drawn" | "overdue") => c.positions.reduce((s, p) => s + p[k], 0);
  const limits = c.positions.filter((p) => p.limit !== null);
  return {
    as_of: c.asOf,
    positions: c.positions.map((p, i) => ({
      entity: p.entity,
      product: p.product,
      drawn: fig(`cirbe:${i}:drawn`, `CIRBE ${c.asOf} · ${p.entity} · ${p.product} · dispuesto`, p.drawn, p.page),
      limit: p.limit === null ? null : fig(`cirbe:${i}:limit`, `CIRBE ${c.asOf} · ${p.entity} · ${p.product} · límite`, p.limit, p.page),
      overdue: fig(`cirbe:${i}:overdue`, `CIRBE ${c.asOf} · ${p.entity} · ${p.product} · vencido`, p.overdue, p.page),
      maturity: p.maturity,
    })),
    totals: {
      drawn: fig("cirbe:total:drawn", `CIRBE ${c.asOf} · total dispuesto`, total("drawn"), c.positions[0]?.page ?? 1),
      overdue: fig("cirbe:total:overdue", `CIRBE ${c.asOf} · total vencido`, total("overdue"), c.positions[0]?.page ?? 1),
      limit: limits.length ? fig("cirbe:total:limit", `CIRBE ${c.asOf} · total límites declarados (${limits.length} posiciones)`, limits.reduce((s, p) => s + (p.limit ?? 0), 0), c.positions[0]?.page ?? 1) : null,
    },
  };
}

function getRegistry(ctx: ToolContext, refs: string[]) {
  const r = ctx.data.registry;
  if (!r.profile) {
    return { confirmed: false, note: r.match?.status === "confirmed" ? "El analista confirmó la hoja registral, pero sus actos aún no se han leído." : "El analista no ha confirmado la hoja del Registro Mercantil de esta empresa: no hay datos del BORME que usar." };
  }
  const p = r.profile;
  return {
    confirmed: true,
    coverage: r.coverage,
    sheet: p.sheet,
    name: p.name,
    former_names: p.formerNames,
    province: p.province,
    constituted_on: p.constitutedOn,
    capital: p.capital ? { value: p.capital.amount, date: p.capital.date, ref: reg(ctx, refs, { id: `borme:capital:${p.sheet}`, label: `BORME · capital social a ${p.capital.date}`, value: p.capital.amount, unit: "EUR" }) } : null,
    officers: p.officers.slice(0, 30),
    acts: p.timeline.slice(-40).map((t) => ({ date: t.date, type: t.type, label: t.label, text_untrusted: untrusted(t.text, 240), ref: reg(ctx, refs, { id: t.source, ...sourceEntry(ctx, t.source) }) })),
  };
}

function getSolvency(ctx: ToolContext, refs: string[]) {
  const s = ctx.data.solvency;
  if (!s) return { note: "No hay informe de solvencia en este caso." };
  if (!s.report) return { note: `El informe «${s.fileName}» está ${s.status === "parsing" ? "leyéndose" : "pendiente de revisión"}; aún no hay datos.` };
  const r = s.report;
  const page = (n: number | null | undefined) => sourceEntry(ctx, n ? `doc:${s.docId}:page:${n}` : `doc:${s.docId}`);
  const fig = (id: string, label: string, value: number | null, p: number | null | undefined) => (value === null ? null : { value, ref: reg(ctx, refs, { id: `solv:${s.docId}:${id}`, value, unit: "EUR", ...page(p), label }) });
  const provider = r.providerName ?? r.provider;
  return {
    provider,
    report_date: r.reportDate,
    uploaded_by: s.uploadedBy,
    provider_figures: {
      note: PROVIDER_FIGURES_NOTE,
      rating: r.rating ? { ...r.rating, ref: reg(ctx, refs, { id: `solv:${s.docId}:rating`, ...page(r.rating.page), label: `Rating de ${provider} (dato del proveedor)` }) } : null,
      default_probability: r.defaultProbability ? { ...r.defaultProbability, ref: reg(ctx, refs, { id: `solv:${s.docId}:pd`, value: r.defaultProbability.percent, unit: "%", ...page(r.defaultProbability.page), label: `Probabilidad de impago de ${provider} (dato del proveedor)` }) } : null,
      credit_limit: r.creditLimit ? { amount: r.creditLimit.amount, ref: reg(ctx, refs, { id: `solv:${s.docId}:limit`, value: r.creditLimit.amount, unit: "EUR", ...page(r.creditLimit.page), label: `Límite de crédito de ${provider} (dato del proveedor)` }) } : null,
    },
    incidents: r.incidents.map((x, i) => ({ registry: x.registryName ?? x.registry, creditor_untrusted: untrusted(x.creditor), date: x.date, status: x.status, amount: fig(`inc:${i}`, `${provider} · incidencia ${x.registryName ?? x.registry}${x.date ? ` ${x.date}` : ""}`, x.amount, x.page) })),
    incidents_total: r.incidentsTotal,
    judicial: r.judicial.map((x, i) => ({ type: x.type, description_untrusted: untrusted(x.description, 240), date: x.date, status: x.status, amount: fig(`jud:${i}`, `${provider} · ${x.type}${x.date ? ` ${x.date}` : ""}`, x.amount, x.page) })),
    financials: r.financials.map((f) => ({
      fiscal_year: f.fiscalYear,
      revenue: fig(`fin:${f.fiscalYear}:revenue`, `${provider} · ventas ${f.fiscalYear}`, f.revenue, f.page),
      net_income: fig(`fin:${f.fiscalYear}:ni`, `${provider} · resultado ${f.fiscalYear}`, f.netIncome, f.page),
      equity: fig(`fin:${f.fiscalYear}:equity`, `${provider} · patrimonio neto ${f.fiscalYear}`, f.equity, f.page),
      total_assets: fig(`fin:${f.fiscalYear}:assets`, `${provider} · activo total ${f.fiscalYear}`, f.totalAssets, f.page),
    })),
  };
}

function compute(ctx: ToolContext, input: z.infer<(typeof TOOL_SCHEMAS)["compute"]>, refs: string[]): ToolOutput {
  const values: Record<string, number> = {};
  const inputs: { name: string; label: string; value: number }[] = [];
  for (const [name, h] of Object.entries(input.operands)) {
    const e = ctx.registry.get(h);
    if (!e) return { ok: false, error: `La referencia ${h} (${name}) no la ha devuelto ninguna herramienta en esta conversación.` };
    if (typeof e.value !== "number") return { ok: false, error: `La referencia ${h} (${name}) no es una cifra; pide la cifra con la herramienta que corresponda.` };
    values[name] = e.value;
    inputs.push({ name, label: e.label, value: round(e.value, 4) });
  }
  const r = evaluate(input.expression, values);
  if (!r.ok) return { ok: false, error: `No se puede calcular «${input.expression}»: ${r.error}.` };
  const id = `calc:${input.expression}:${JSON.stringify(Object.entries(input.operands).sort())}`;
  const ref = reg(ctx, refs, { id, label: `Cálculo · ${input.label}: ${input.expression} (${inputs.map((i) => `${i.name} = ${i.label}`).join("; ")})`, value: r.value, unit: input.unit });
  return { ok: true, result: { value: round(r.value, 4), unit: input.unit, ref, inputs }, refs };
}

/** Validates the model's input and runs the tool. Never throws on bad input: the model gets an error to correct. */
export async function runTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<ToolOutput> {
  if (!(name in TOOL_SCHEMAS)) return { ok: false, error: `Herramienta desconocida: ${name}` };
  const tool = name as ToolName;
  const parsed = TOOL_SCHEMAS[tool].safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, error: `Parámetros no válidos: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}` };
  const refs: string[] = [];
  const input = parsed.data as never;
  switch (tool) {
    case "get_statements": return { ok: true, result: getStatements(ctx, input, refs), refs };
    case "get_kpis": return { ok: true, result: getKpis(ctx, input, refs), refs };
    case "get_checks": return { ok: true, result: getChecks(ctx, input, refs), refs };
    case "search_bank_movements": return { ok: true, result: await searchBank(ctx, input, refs), refs };
    case "aggregate_bank_movements": return { ok: true, result: await aggregateBank(ctx, input, refs), refs };
    case "get_debt_positions": return { ok: true, result: getDebt(ctx, refs), refs };
    case "get_registry": return { ok: true, result: getRegistry(ctx, refs), refs };
    case "get_solvency_report": return { ok: true, result: getSolvency(ctx, refs), refs };
    case "compute": return compute(ctx, input, refs);
  }
}
