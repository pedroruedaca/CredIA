/**
 * Cost of sales as the analyst defines it, and the adjusted gross margin it gives. Pure.
 *
 * The accounting gross margin (engine.ts) takes cost of sales as aprovisionamientos (60/61) only. For a business whose
 * direct costs are its people, plant or subcontracted services, that reads high, and the PGC does not separate direct
 * from indirect costs (all of 64 is personnel, all of 62 is external services). So the analyst says which costs are
 * direct, case by case: whole canonical lines, PGC groups or subaccounts (trial balance / Holded), or model lines
 * (annual accounts). The result is shown as the analyst's criterion, next to the accounting figure, never instead.
 *
 * Selectors:
 *   line:<expense line>  every contribution of that canonical line (works for any source)
 *   6xx…                 accounts whose code starts with these digits (2 to 10 digits; trial balance / Holded)
 *   label:<model line>   a line of the annual-accounts model, by its label
 */
import type { CanonicalStatement, ExpenseLine, LineContribution } from "../pgc/mapping.ts";
import type { Kpi } from "./engine.ts";

export type CostKpiKey = "adjustedGrossMargin";

/** Operating expense lines that can be cost of sales (depreciation, financial costs and taxes on profit cannot). */
export const COST_LINES = ["cogs", "personnel", "externalServices", "otherTaxes", "otherOperatingExpenses"] as const satisfies readonly ExpenseLine[];
export type CostLine = (typeof COST_LINES)[number];

export const COST_LINE_LABEL: Record<CostLine, string> = {
  cogs: "Aprovisionamientos (60, 61)",
  personnel: "Gastos de personal (64)",
  externalServices: "Servicios exteriores (62)",
  otherTaxes: "Tributos (63)",
  otherOperatingExpenses: "Otros gastos de explotación (65…)",
};

/** Names of the 3-digit PGC expense accounts, for the editor when the ledger brings none. */
export const PGC_EXPENSE_NAMES: Record<string, string> = {
  "600": "Compras de mercaderías", "601": "Compras de materias primas", "602": "Compras de otros aprovisionamientos",
  "606": "Descuentos sobre compras por pronto pago", "607": "Trabajos realizados por otras empresas", "608": "Devoluciones de compras",
  "609": "Rappels por compras", "610": "Variación de existencias de mercaderías", "611": "Variación de existencias de materias primas",
  "612": "Variación de existencias de otros aprovisionamientos",
  "621": "Arrendamientos y cánones", "622": "Reparaciones y conservación", "623": "Servicios de profesionales independientes",
  "624": "Transportes", "625": "Primas de seguros", "626": "Servicios bancarios y similares", "627": "Publicidad, propaganda y relaciones públicas",
  "628": "Suministros", "629": "Otros servicios",
  "631": "Otros tributos", "634": "Ajustes negativos en la imposición indirecta", "639": "Ajustes positivos en la imposición indirecta",
  "640": "Sueldos y salarios", "641": "Indemnizaciones", "642": "Seguridad Social a cargo de la empresa", "643": "Retribuciones a largo plazo",
  "649": "Otros gastos sociales",
  "650": "Pérdidas de créditos comerciales incobrables", "651": "Resultados de operaciones en común", "659": "Otras pérdidas en gestión corriente",
};

export const COST_PRESETS = ["trading", "manufacturing", "services"] as const;
export type CostPreset = (typeof COST_PRESETS)[number];

/** Starting points; the analyst can tick or untick anything after choosing one. */
export const PRESET_SELECTORS: Record<CostPreset, string[]> = {
  trading: ["line:cogs"],
  manufacturing: ["line:cogs", "line:personnel", "621", "622", "624", "628"],
  services: ["line:cogs", "line:personnel", "623"],
};

export const PRESET_LABEL: Record<CostPreset | "custom", string> = {
  trading: "Comercio",
  manufacturing: "Industria",
  services: "Servicios",
  custom: "Personalizado",
};

export const PRESET_HINT: Record<CostPreset, string> = {
  trading: "Solo aprovisionamientos: igual que el margen contable.",
  manufacturing: "Aprovisionamientos, personal, arrendamientos, reparaciones, transportes y suministros.",
  services: "Aprovisionamientos, personal y servicios de profesionales independientes.",
};

export interface CostOfSalesDefinition {
  preset: CostPreset | "custom";
  selectors: string[];
}

const SELECTOR = /^(line:(cogs|personnel|externalServices|otherTaxes|otherOperatingExpenses)|6\d{1,9}|label:.{1,160})$/;

/** Anything stored or posted → a valid definition, or null (nothing valid, or nothing selected). */
export function normalizeCostDefinition(raw: unknown): CostOfSalesDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const selectors = Array.isArray(r.selectors) ? [...new Set(r.selectors.filter((s): s is string => typeof s === "string" && SELECTOR.test(s)))].slice(0, 300) : [];
  if (!selectors.length) return null;
  const preset = (COST_PRESETS as readonly unknown[]).includes(r.preset) ? (r.preset as CostPreset) : "custom";
  // A preset name only while the selection is still exactly the preset's.
  const same = preset !== "custom" && sameSet(selectors, PRESET_SELECTORS[preset]);
  return { preset: same ? preset : "custom", selectors };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The preset a selection matches, if any. */
export const presetOf = (selectors: string[]): CostPreset | "custom" => COST_PRESETS.find((p) => sameSet(selectors, PRESET_SELECTORS[p])) ?? "custom";

const isCode = (account: string) => /^\d+$/.test(account);

/** Whether a selector takes this contribution of this line. */
export function selects(selector: string, line: CostLine, c: Pick<LineContribution, "account">): boolean {
  if (selector.startsWith("line:")) return selector === `line:${line}`;
  if (selector.startsWith("label:")) return !isCode(c.account) && c.account === selector.slice(6);
  return isCode(c.account) && c.account.startsWith(selector);
}

export interface CostOfSalesResult {
  total: number;
  /** Contributions counted, each once, with their source. */
  items: (LineContribution & { line: CostLine })[];
  /** Selectors that took nothing in this statement (e.g. account codes on a statement from annual accounts). */
  unmatched: string[];
}

export function applyCostOfSales(s: CanonicalStatement, def: CostOfSalesDefinition): CostOfSalesResult {
  const items: CostOfSalesResult["items"] = [];
  const used = new Set<string>();
  for (const line of COST_LINES) {
    for (const c of s.lineage[line] ?? []) {
      const hit = def.selectors.filter((sel) => selects(sel, line, c));
      if (!hit.length) continue;
      hit.forEach((h) => used.add(h));
      items.push({ ...c, line });
    }
  }
  const total = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  return { total, items, unmatched: def.selectors.filter((sel) => !used.has(sel)) };
}

/** Readable name of a selector, for notes and lists. */
export function selectorLabel(sel: string, names: Record<string, string> = {}): string {
  if (sel.startsWith("line:")) return COST_LINE_LABEL[sel.slice(5) as CostLine] ?? sel;
  if (sel.startsWith("label:")) return sel.slice(6);
  const name = names[sel] ?? PGC_EXPENSE_NAMES[sel];
  return name ? `${sel} ${name}` : sel;
}

export interface CostDefinitionMeta {
  /** "analyst" (saved on the case) or "template" (copied from the template when the case was created). */
  source: "analyst" | "template";
  at: string | null;
}

/**
 * Gross margin with the analyst's cost of sales. Null with a reason when there is no definition or no P&L. Selectors
 * a statement cannot take (account codes when it comes from the annual accounts) are named in the note.
 */
export function adjustedGrossMarginKpi(s: CanonicalStatement, def: CostOfSalesDefinition | null, meta?: CostDefinitionMeta, names: Record<string, string> = {}): Kpi {
  const base = { key: "adjustedGrossMargin" as const, unit: "%" as const, formula: "(cifra de negocios − coste de ventas según el analista) / cifra de negocios" };
  if (!s.pnlAvailable || s.scope === "revenue") return { ...base, value: null, inputs: {}, note: "Sin cuenta de resultados para este periodo" };
  if (!def) return { ...base, value: null, inputs: {}, note: "Sin definir: elige en «Coste de ventas» qué costes son directos" };
  const r = applyCostOfSales(s, def);
  const revenue = s.incomeStatement.revenue;
  const value = revenue > 0 ? Math.round(((revenue - r.total) / revenue) * 1000) / 10 : null;
  const who = meta?.source === "template" ? "Criterio de la plantilla" : "Criterio del analista";
  const notes = [
    `${who} (${PRESET_LABEL[def.preset]}): ${def.selectors.filter((x) => !r.unmatched.includes(x)).map((x) => selectorLabel(x, names)).join(", ") || "nada de este periodo"}`,
    r.unmatched.length ? `Sin importe en este periodo: ${r.unmatched.map((x) => selectorLabel(x, names)).join(", ")}${r.unmatched.some((x) => !x.startsWith("line:") && !x.startsWith("label:")) && r.items.every((i) => !isCode(i.account)) ? " (con cuentas anuales solo cuentan las líneas del modelo)" : ""}` : null,
    revenue > 0 ? null : "Cifra de negocios nula",
  ];
  return {
    ...base,
    value,
    inputs: { revenue, adjustedCostOfSales: r.total, accountingCostOfSales: s.incomeStatement.cogs },
    note: notes.filter(Boolean).join(". "),
  };
}

export interface CostOption {
  /** Selector this row ticks. */
  selector: string;
  label: string;
  /** Amount by period kind (closed_fy, ytd), for the editor's columns. */
  amounts: Partial<Record<"closed_fy" | "ytd", number>>;
  sourceRef: string | null;
  children: CostOption[];
}

/**
 * What the editor offers, per cost line: the line itself, then its 3-digit PGC groups with their subaccounts (ledger
 * statements), or its model lines (annual accounts). Amounts from every statement given.
 */
export function costOptions(statements: CanonicalStatement[], names: Record<string, string> = {}): { line: CostLine; option: CostOption }[] {
  return COST_LINES.map((line) => {
    const option: CostOption = { selector: `line:${line}`, label: COST_LINE_LABEL[line], amounts: {}, sourceRef: null, children: [] };
    const groups = new Map<string, CostOption>();
    for (const s of statements) {
      const kind = s.period.kind;
      for (const c of s.lineage[line] ?? []) {
        option.amounts[kind] = round2((option.amounts[kind] ?? 0) + c.amount);
        if (isCode(c.account)) {
          const g3 = c.account.slice(0, 3);
          let g = groups.get(g3);
          if (!g) groups.set(g3, (g = { selector: g3, label: selectorLabel(g3, names), amounts: {}, sourceRef: null, children: [] }));
          g.amounts[kind] = round2((g.amounts[kind] ?? 0) + c.amount);
          if (c.account.length > 3) {
            let a = g.children.find((x) => x.selector === c.account);
            if (!a) g.children.push((a = { selector: c.account, label: names[c.account] ? `${c.account} ${names[c.account]}` : c.account, amounts: {}, sourceRef: c.sourceRef, children: [] }));
            a.amounts[kind] = round2((a.amounts[kind] ?? 0) + c.amount);
          }
        } else {
          const sel = `label:${c.account}`;
          let m = groups.get(sel);
          if (!m) groups.set(sel, (m = { selector: sel, label: c.account, amounts: {}, sourceRef: c.sourceRef, children: [] }));
          m.amounts[kind] = round2((m.amounts[kind] ?? 0) + c.amount);
        }
      }
    }
    option.children = [...groups.values()].sort((a, b) => a.selector.localeCompare(b.selector));
    for (const g of option.children) g.children.sort((a, b) => a.selector.localeCompare(b.selector));
    return { line, option };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every selector below an option (its groups, subaccounts or model lines). */
export const descendants = (o: CostOption): string[] => o.children.flatMap((c) => [c.selector, ...descendants(c)]);

/**
 * Ticks or unticks one option. Ticking it drops what is below it (now implied); unticking leaves the rest as it was.
 * Returns the selection in the order the options are listed, so the same choice always looks the same.
 */
export function toggleSelection(selectors: string[], option: CostOption, on: boolean, order: string[]): string[] {
  const below = new Set(descendants(option));
  const next = on ? [...selectors.filter((s) => !below.has(s)), option.selector] : selectors.filter((s) => s !== option.selector);
  const rank = (s: string) => (order.indexOf(s) === -1 ? Number.MAX_SAFE_INTEGER : order.indexOf(s));
  return [...new Set(next)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ---------------------------------------------------------------------------------------------------------------
// Templates: a default definition at line / 3-digit PGC level (no ledger yet), copied into each new case.

/** Which canonical line a 3-digit expense account belongs to (as the PGC mapping assigns it). */
const lineOfPgc3 = (code: string): CostLine | null =>
  /^6[01]/.test(code) ? "cogs" : code.startsWith("62") ? "externalServices" : /^63[1-9]/.test(code) ? "otherTaxes" : code.startsWith("64") ? "personnel" : code.startsWith("65") ? "otherOperatingExpenses" : null;

/** The options a template offers: each line with the 3-digit groups of the PGC that roll into it. */
export function templateCostOptions(): { line: CostLine; option: CostOption }[] {
  return COST_LINES.map((line) => ({
    line,
    option: {
      selector: `line:${line}`,
      label: COST_LINE_LABEL[line],
      amounts: {},
      sourceRef: null,
      children: Object.keys(PGC_EXPENSE_NAMES)
        .filter((code) => lineOfPgc3(code) === line)
        .map((code) => ({ selector: code, label: selectorLabel(code), amounts: {}, sourceRef: null, children: [] })),
    },
  }));
}

/**
 * The template form's fields → a definition: `cos_preset` (none | a preset | custom) and one `cos:<selector>` per
 * ticked option. A preset with nothing ticked takes the preset's own selection. "none" → null.
 */
export function parseCostFields(values: Record<string, string | undefined>): CostOfSalesDefinition | null {
  const preset = values.cos_preset ?? "none";
  if (preset === "none") return null;
  const ticked = Object.keys(values).filter((k) => k.startsWith("cos:") && values[k]).map((k) => k.slice(4));
  const selectors = ticked.length ? ticked : (COST_PRESETS as readonly string[]).includes(preset) ? PRESET_SELECTORS[preset as CostPreset] : [];
  return normalizeCostDefinition({ preset, selectors });
}

/** A definition → the template form's fields (the reverse of parseCostFields). */
export function costFormValues(def: CostOfSalesDefinition | null): Record<string, string> {
  if (!def) return { cos_preset: "none" };
  return { cos_preset: def.preset, ...Object.fromEntries(def.selectors.map((s) => [`cos:${s}`, "on"])) };
}
