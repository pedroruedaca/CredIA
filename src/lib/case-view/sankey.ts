/**
 * P&L as a Sankey: a cascade Ingresos → Margen bruto → EBITDA → Resultado de explotación → Resultado neto, with
 * each cost branching off. When a stage is not positive (loss, negative margin) the cascade would not conserve
 * flow, so it falls back to a flat layout: income → total → costs + result (or loss as an extra source).
 * Pure: model + layout geometry, shared by the web view and the PDF.
 */
import type { CanonicalStatement, Line, LineContribution } from "../pgc/mapping.ts";
import type { SegmentTone } from "./balance.ts";

export interface SankeyNode {
  id: string;
  label: string;
  col: number;
  value: number;
  tone: SegmentTone;
  /** Leaf nodes: the accounts behind them. Intermediate nodes: empty, `formula` explains them. */
  accounts: LineContribution[];
  formula?: string;
  /** A subtotal the eye should follow (bold label). */
  emphasis?: boolean;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface PnlSankey {
  kind: "cascade" | "flat";
  nodes: SankeyNode[];
  links: SankeyLink[];
  revenue: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function lineage(s: CanonicalStatement, lines: Line[], sign = 1): LineContribution[] {
  return lines
    .flatMap((l) => s.lineage[l] ?? [])
    .filter((c) => c.amount !== 0)
    .map((c) => ({ ...c, amount: c.amount * sign }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function pnlSankey(s: CanonicalStatement): PnlSankey | null {
  if (!s.pnlAvailable) return null;
  const is = s.incomeStatement;
  const opIncome = r2(is.revenue + is.otherOperatingIncome);
  const gross = r2(opIncome - is.cogs);
  const services = r2(is.externalServices + is.otherTaxes + is.otherOperatingExpenses);
  const ebitda = r2(is.ebitda);
  const dep = r2(is.depreciation + is.operatingImpairments);
  const others = r2(is.grantsTransferred + is.nonRecurringResult);
  const op = r2(is.operatingResult);
  const finExp = r2(is.financialExpense + is.financialImpairments);
  const net = r2(is.netIncome);
  const costs = [is.cogs, is.personnel, services, dep, finExp, is.incomeTax];

  const cascadeOk = opIncome > 0 && gross > 0 && ebitda > 0 && op > 0 && net >= 0 && is.financialIncome >= 0 && costs.every((c) => c >= 0);
  return cascadeOk ? cascade() : flat();

  function cascade(): PnlSankey {
    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];
    const node = (n: SankeyNode) => n.value > 0.005 && nodes.push(n);
    const link = (source: string, target: string, value: number) => value > 0.005 && links.push({ source, target, value: r2(value) });

    // With other operating income, sources merge into "Ingresos" first; otherwise the chart starts at sales.
    const o = is.otherOperatingIncome > 0.005 ? 1 : 0;
    if (o) {
      node({ id: "revenue", label: "Cifra de negocios", col: 0, value: is.revenue, tone: "asset-3", accounts: lineage(s, ["revenue"]) });
      node({ id: "otherIncome", label: "Otros ingresos", col: 0, value: is.otherOperatingIncome, tone: "asset-2", accounts: lineage(s, ["otherOperatingIncome"]) });
      node({ id: "income", label: "Ingresos", col: 1, value: opIncome, tone: "asset-3", accounts: [], formula: "cifra de negocios + otros ingresos de explotación", emphasis: true });
      link("revenue", "income", is.revenue);
      link("otherIncome", "income", is.otherOperatingIncome);
    } else {
      node({ id: "income", label: "Cifra de negocios", col: 0, value: opIncome, tone: "asset-3", accounts: lineage(s, ["revenue"]), emphasis: true });
    }

    node({ id: "gross", label: "Margen bruto", col: 1 + o, value: gross, tone: "asset-2", accounts: [], formula: "ingresos − aprovisionamientos", emphasis: true });
    node({ id: "cogs", label: "Aprovisionamientos", col: 1 + o, value: is.cogs, tone: "other", accounts: lineage(s, ["cogs"]) });
    link("income", "gross", gross);
    link("income", "cogs", is.cogs);

    node({ id: "ebitda", label: "EBITDA", col: 2 + o, value: ebitda, tone: "asset-2", accounts: [], formula: "margen bruto − personal − servicios exteriores y tributos", emphasis: true });
    node({ id: "personnel", label: "Personal", col: 2 + o, value: is.personnel, tone: "related", accounts: lineage(s, ["personnel"]) });
    node({ id: "services", label: "Servicios y tributos", col: 2 + o, value: services, tone: "debt-1", accounts: lineage(s, ["externalServices", "otherTaxes", "otherOperatingExpenses"]) });
    link("gross", "ebitda", ebitda);
    link("gross", "personnel", is.personnel);
    link("gross", "services", services);

    // Grants and non-recurring results: an extra source into the operating result when positive, a cost when negative.
    node({ id: "operating", label: "Rdo. explotación", col: 3 + o, value: op, tone: "asset-2", accounts: [], formula: "EBITDA − amortización ± otros resultados", emphasis: true });
    node({ id: "depreciation", label: "Amortización", col: 3 + o, value: dep, tone: "asset-1", accounts: lineage(s, ["depreciation", "operatingImpairments"]) });
    const otherAccounts = lineage(s, ["grantsTransferred", "nonRecurringResult"], others < 0 ? -1 : 1);
    if (others > 0) {
      node({ id: "others", label: "Otros resultados", col: 2 + o, value: others, tone: "asset-1", accounts: otherAccounts });
      link("others", "operating", others);
    } else if (others < 0) {
      node({ id: "others", label: "Otros resultados", col: 3 + o, value: -others, tone: "other", accounts: otherAccounts });
      link("ebitda", "others", -others);
    }
    link("ebitda", "operating", ebitda - dep - Math.max(0, -others));
    link("ebitda", "depreciation", dep);

    // Financial result netted (income against expense), as SME financial Sankeys usually show it: a cost when
    // negative (the common case), an extra input into net profit when positive. Both accounts stay in the lineage.
    const finNet = r2(is.financialIncome - finExp);
    const finAccounts = lineage(s, ["financialExpense", "financialImpairments"]).concat(lineage(s, ["financialIncome"], -1));
    node({ id: "net", label: "Resultado neto", col: 4 + o, value: net, tone: "asset-3", accounts: [], formula: "resultado de explotación + resultado financiero − impuesto", emphasis: true });
    if (finNet < 0) {
      node({ id: "financial", label: "Gastos financieros netos", col: 4 + o, value: -finNet, tone: "debt-2", accounts: finAccounts, formula: "gastos financieros − ingresos financieros" });
      link("operating", "financial", -finNet);
    } else if (finNet > 0) {
      node({ id: "financial", label: "Resultado financiero", col: 3 + o, value: finNet, tone: "asset-1", accounts: finAccounts.map((c) => ({ ...c, amount: -c.amount })), formula: "ingresos financieros − gastos financieros" });
      link("financial", "net", Math.min(finNet, net));
      if (finNet > net) link("financial", "incomeTax", finNet - net);
    }
    node({ id: "incomeTax", label: "Impuesto", col: 4 + o, value: is.incomeTax, tone: "other", accounts: lineage(s, ["incomeTax"]) });
    const fromFin = finNet > 0 ? finNet : 0;
    link("operating", "net", net - Math.min(fromFin, net));
    link("operating", "incomeTax", is.incomeTax - Math.max(0, fromFin - net));
    return { kind: "cascade", nodes, links, revenue: is.revenue };
  }

  function flat(): PnlSankey {
    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];
    const sources: [string, string, number, SegmentTone, LineContribution[]][] = [
      ["revenue", "Cifra de negocios", is.revenue, "asset-3", lineage(s, ["revenue"])],
      ["otherIncome", "Otros ingresos", is.otherOperatingIncome + Math.max(0, is.grantsTransferred), "asset-2", lineage(s, ["otherOperatingIncome", "grantsTransferred"])],
      ["financialIncome", "Ingresos financieros", is.financialIncome, "asset-1", lineage(s, ["financialIncome"])],
      ["nonRecurringIn", "Resultados excepcionales", Math.max(0, is.nonRecurringResult), "asset-1", lineage(s, ["nonRecurringResult"])],
      ["loss", "Pérdida del periodo", Math.max(0, -net), "debt-2", []],
    ];
    const targets: [string, string, number, SegmentTone, LineContribution[]][] = [
      ["cogs", "Aprovisionamientos", is.cogs, "other", lineage(s, ["cogs"])],
      ["personnel", "Personal", is.personnel, "related", lineage(s, ["personnel"])],
      ["services", "Servicios y tributos", services, "debt-1", lineage(s, ["externalServices", "otherTaxes", "otherOperatingExpenses"])],
      ["depreciation", "Amortización", dep, "asset-1", lineage(s, ["depreciation", "operatingImpairments"])],
      ["nonRecurringOut", "Resultados excepcionales", Math.max(0, -is.nonRecurringResult), "other", lineage(s, ["nonRecurringResult"], -1)],
      ["financialExpense", "Gastos financieros", finExp, "debt-2", lineage(s, ["financialExpense", "financialImpairments"])],
      ["incomeTax", "Impuesto", is.incomeTax, "other", lineage(s, ["incomeTax"])],
      ["net", "Resultado neto", Math.max(0, net), "asset-3", []],
    ];
    const total = r2(sources.reduce((sum, x) => sum + Math.max(0, x[2]), 0));
    for (const [id, label, value, tone, accounts] of sources) {
      if (value <= 0.005) continue;
      nodes.push({ id, label, col: 0, value: r2(value), tone, accounts, formula: id === "loss" ? "gastos − ingresos del periodo" : undefined, emphasis: id === "loss" });
      links.push({ source: id, target: "total", value: r2(value) });
    }
    nodes.push({ id: "total", label: "Total", col: 1, value: total, tone: "asset-2", accounts: [], formula: "ingresos del periodo (+ pérdida, si la hay)", emphasis: true });
    for (const [id, label, value, tone, accounts] of targets) {
      if (value <= 0.005) continue;
      nodes.push({ id, label, col: 2, value: r2(value), tone, accounts, formula: id === "net" ? "ingresos − gastos del periodo" : undefined, emphasis: id === "net" });
      links.push({ source: "total", target: id, value: r2(value) });
    }
    return { kind: "flat", nodes, links, revenue: is.revenue };
  }
}

// ------------------------------------------------------------------------------------------------ layout

export interface LaidNode extends SankeyNode {
  x: number;
  y: number;
  h: number;
}
export interface LaidLink extends SankeyLink {
  path: string;
  tone: SegmentTone;
}

/**
 * Columns spread across `width` (leaving `labelRight` for the last column's labels); nodes stacked from the top
 * in model order with `gap` between them; one vertical scale for all columns so widths are comparable.
 */
export function layoutSankey(model: PnlSankey, opts: { width: number; height: number; nodeWidth?: number; gap?: number; labelRight?: number; minSlot?: number }) {
  const nodeWidth = opts.nodeWidth ?? 10;
  const gap = opts.gap ?? 14;
  const labelRight = opts.labelRight ?? 150;
  // Every node gets at least this much vertical room so its two-line label never collides with the next one.
  const minSlot = opts.minSlot ?? 0;
  const cols = Math.max(...model.nodes.map((n) => n.col)) + 1;
  const byCol = Array.from({ length: cols }, (_, c) => model.nodes.filter((n) => n.col === c));
  const scale = Math.min(...byCol.map((ns) => (opts.height - gap * Math.max(0, ns.length - 1)) / Math.max(1, ns.reduce((s, n) => s + n.value, 0))));
  const step = cols > 1 ? (opts.width - labelRight - nodeWidth) / (cols - 1) : 0;

  const laid = new Map<string, LaidNode>();
  byCol.forEach((ns, c) => {
    let y = 0;
    for (const n of ns) {
      const h = Math.max(1.5, n.value * scale);
      laid.set(n.id, { ...n, x: c * step, y, h });
      y += Math.max(h, minSlot) + gap;
    }
  });

  // Stack link ends on each node in the order of the node at the other end.
  const outY = new Map<string, number>();
  const inY = new Map<string, number>();
  const ordered = [...model.links].sort((a, b) => laid.get(a.source)!.y - laid.get(b.source)!.y || laid.get(a.target)!.y - laid.get(b.target)!.y);
  const bySourceOrder = [...ordered].sort((a, b) => laid.get(a.source)!.y - laid.get(b.source)!.y || laid.get(a.target)!.y - laid.get(b.target)!.y);
  const byTargetOrder = [...ordered].sort((a, b) => laid.get(a.target)!.y - laid.get(b.target)!.y || laid.get(a.source)!.y - laid.get(b.source)!.y);
  const sourceOffset = new Map<SankeyLink, number>();
  const targetOffset = new Map<SankeyLink, number>();
  for (const l of bySourceOrder) {
    const o = outY.get(l.source) ?? 0;
    sourceOffset.set(l, o);
    outY.set(l.source, o + l.value * scale);
  }
  for (const l of byTargetOrder) {
    const o = inY.get(l.target) ?? 0;
    targetOffset.set(l, o);
    inY.set(l.target, o + l.value * scale);
  }

  const links: LaidLink[] = model.links.map((l) => {
    const s = laid.get(l.source)!;
    const t = laid.get(l.target)!;
    const w = l.value * scale;
    const x0 = s.x + nodeWidth;
    const x1 = t.x;
    const y0 = s.y + sourceOffset.get(l)!;
    const y1 = t.y + targetOffset.get(l)!;
    const mx = (x0 + x1) / 2;
    const f = (n: number) => Math.round(n * 10) / 10;
    const path = `M${f(x0)} ${f(y0)}C${f(mx)} ${f(y0)} ${f(mx)} ${f(y1)} ${f(x1)} ${f(y1)}L${f(x1)} ${f(y1 + w)}C${f(mx)} ${f(y1 + w)} ${f(mx)} ${f(y0 + w)} ${f(x0)} ${f(y0 + w)}Z`;
    return { ...l, path, tone: t.tone };
  });
  const height = Math.max(...[...laid.values()].map((n) => n.y + Math.max(n.h, minSlot)));
  return { nodes: [...laid.values()], links, nodeWidth, height, scale };
}
