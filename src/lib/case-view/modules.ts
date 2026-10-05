/**
 * Case view modules and layouts (phase 1 of the modular case view). Pure.
 *
 * The case view body is a list of modules drawn in layout order. A layout lists modules with a width: "full", or
 * "half" (two consecutive half modules share a row on wide screens). The header and the evidence panel are not
 * modules. Phase 1 draws every case from DEFAULT_LAYOUT; later phases store team templates (and per-user overrides)
 * as JSON in this same shape, so whatever is stored goes through normalizeLayout before it is drawn.
 */
import { z } from "zod";

export const MODULE_IDS = [
  "summary",
  "kpis",
  "review",
  "pnl",
  "balance",
  "analyst_documents",
  "annual_accounts",
  "solvency",
  "registry",
  "sources",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleWidth = "full" | "half";

export interface ModuleSpec {
  id: ModuleId;
  /** Name in the module catalogue (Spanish UI copy). */
  title: string;
  /** What it shows, for the catalogue. */
  description: string;
  /** "Para revisar" cannot be removed: hiding the alerts would defeat the package. */
  removable: boolean;
  /** Widths it can take; modules that need the full width (wide tables, the Sankey) only allow "full". */
  widths: readonly ModuleWidth[];
}

export const MODULE_SPECS: Record<ModuleId, ModuleSpec> = {
  summary: { id: "summary", title: "Resumen", description: "Frase con las cifras que elijas: ventas, EBITDA, deuda CIRBE frente a libros, resultado, deuda neta…", removable: true, widths: ["full"] },
  kpis: { id: "kpis", title: "Indicadores", description: "Hasta cinco indicadores a elegir: DSCR, DSO/DPO, cifra de negocios, EBITDA…", removable: true, widths: ["full"] },
  review: { id: "review", title: "Para revisar", description: "Verificaciones abiertas y correctas, con su evidencia.", removable: false, widths: ["full", "half"] },
  pnl: { id: "pnl", title: "Cuenta de resultados", description: "Diagrama de ingresos a resultado del periodo base.", removable: true, widths: ["full"] },
  balance: { id: "balance", title: "Balance", description: "Estructura del activo y del pasivo, con su origen.", removable: true, widths: ["full", "half"] },
  analyst_documents: { id: "analyst_documents", title: "Documentos que subes tú", description: "Documentos marcados «Lo subo yo» y su estado.", removable: true, widths: ["full", "half"] },
  annual_accounts: { id: "annual_accounts", title: "Cuentas anuales", description: "Depósito de cuentas: ejercicio, modelo y subida.", removable: true, widths: ["full", "half"] },
  solvency: { id: "solvency", title: "Informe de solvencia", description: "Incidencias y cifras del proveedor, atribuidas a él.", removable: true, widths: ["full", "half"] },
  registry: { id: "registry", title: "Registro Mercantil", description: "BORME: hoja registral y actos publicados.", removable: true, widths: ["full", "half"] },
  sources: { id: "sources", title: "Fuentes", description: "Documentos y conexiones de los que salen las cifras.", removable: true, widths: ["full"] },
};

// ---------------------------------------------------------------------------------------------------------------
// Module settings (optional, per module, saved with the layout)

/** Figures the summary sentence can state («Resumen» module settings); the first three are the default (the original sentence). */
export const SUMMARY_FACT_IDS = ["revenue", "ebitda", "cirbe", "netIncome", "ytdRevenue", "netDebt", "equity", "workingCapital"] as const;
export type SummaryFactId = (typeof SUMMARY_FACT_IDS)[number];
export const DEFAULT_SUMMARY_FACTS: SummaryFactId[] = ["revenue", "ebitda", "cirbe"];

/** KPI tiles the «Indicadores» module can show; the first five are the default row. */
export const KPI_TILE_IDS = ["dscr", "interestCoverage", "netDebtToEbitda", "currentRatio", "dsoDpo", "revenue", "ebitda", "debtToEquity", "workingCapital", "financialDebt"] as const;
export type KpiTileId = (typeof KPI_TILE_IDS)[number];
export const DEFAULT_KPI_TILES: KpiTileId[] = ["dscr", "interestCoverage", "netDebtToEbitda", "currentRatio", "dsoDpo"];
export const MAX_KPI_TILES = 5;

/** Which statement a module draws: the base period (closed year if there is one, else year to date), or a fixed one. */
export type PeriodChoice = "base" | "closed" | "ytd";

export interface ModuleSettings {
  /** «Resumen»: figures the sentence states (at least one). */
  facts?: SummaryFactId[];
  /** «Indicadores»: tiles in order (1 to 5). */
  tiles?: KpiTileId[];
  /** «Cuenta de resultados», «Balance». */
  period?: PeriodChoice;
  /** «Para revisar»: show the passed checks. */
  showPassed?: boolean;
}

/** Which settings each module takes. */
export const MODULE_SETTINGS: Partial<Record<ModuleId, (keyof ModuleSettings)[]>> = {
  summary: ["facts"],
  kpis: ["tiles"],
  pnl: ["period"],
  balance: ["period"],
  review: ["showPassed"],
};

export const DEFAULT_SETTINGS: Required<ModuleSettings> = { facts: DEFAULT_SUMMARY_FACTS, tiles: DEFAULT_KPI_TILES, period: "base", showPassed: true };

/** Stored settings → only the keys the module takes, with valid values; nothing when none is valid. */
export function normalizeSettings(id: ModuleId, raw: unknown): ModuleSettings | undefined {
  const keys = MODULE_SETTINGS[id];
  if (!keys || !raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: ModuleSettings = {};
  if (keys.includes("facts") && Array.isArray(r.facts)) {
    const facts = [...new Set(r.facts.filter((f): f is SummaryFactId => (SUMMARY_FACT_IDS as readonly unknown[]).includes(f)))];
    if (facts.length) out.facts = facts;
  }
  if (keys.includes("tiles") && Array.isArray(r.tiles)) {
    const tiles = [...new Set(r.tiles.filter((t): t is KpiTileId => (KPI_TILE_IDS as readonly unknown[]).includes(t)))].slice(0, MAX_KPI_TILES);
    if (tiles.length) out.tiles = tiles;
  }
  if (keys.includes("period") && (r.period === "base" || r.period === "closed" || r.period === "ytd")) out.period = r.period;
  if (keys.includes("showPassed") && typeof r.showPassed === "boolean") out.showPassed = r.showPassed;
  return Object.keys(out).length ? out : undefined;
}

/** A module's settings with the defaults filled in. */
export const moduleSettings = (m: Pick<LayoutModule, "settings"> | undefined): Required<ModuleSettings> => ({ ...DEFAULT_SETTINGS, ...(m?.settings ?? {}) });

export interface LayoutModule {
  id: ModuleId;
  width: ModuleWidth;
  settings?: ModuleSettings;
}

export interface Layout {
  version: 1;
  modules: LayoutModule[];
}

/** Today's case view, in today's order. */
export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  modules: [
    { id: "summary", width: "full" },
    { id: "kpis", width: "full" },
    { id: "review", width: "full" },
    { id: "pnl", width: "full" },
    { id: "balance", width: "full" },
    { id: "analyst_documents", width: "full" },
    { id: "annual_accounts", width: "full" },
    { id: "solvency", width: "full" },
    { id: "registry", width: "full" },
    { id: "sources", width: "full" },
  ],
};

const StoredLayout = z.object({
  version: z.literal(1),
  modules: z.array(z.object({ id: z.string(), width: z.string().optional(), settings: z.unknown().optional() }).passthrough()),
});

/**
 * Any stored layout → a layout safe to draw: unknown modules dropped, each module once, a width the module allows
 * (else its first), and modules that cannot be removed added back (at their default position) if missing. Anything
 * that does not parse falls back to the default.
 */
export function normalizeLayout(raw: unknown): Layout {
  const parsed = StoredLayout.safeParse(raw);
  if (!parsed.success) return DEFAULT_LAYOUT;
  const seen = new Set<ModuleId>();
  const modules: LayoutModule[] = [];
  for (const m of parsed.data.modules) {
    if (!(MODULE_IDS as readonly string[]).includes(m.id)) continue;
    const id = m.id as ModuleId;
    if (seen.has(id)) continue;
    seen.add(id);
    const spec = MODULE_SPECS[id];
    const width = spec.widths.includes(m.width as ModuleWidth) ? (m.width as ModuleWidth) : spec.widths[0];
    const settings = normalizeSettings(id, m.settings);
    modules.push(settings ? { id, width, settings } : { id, width });
  }
  for (const [i, m] of DEFAULT_LAYOUT.modules.entries()) {
    if (MODULE_SPECS[m.id].removable || seen.has(m.id)) continue;
    modules.splice(Math.min(i, modules.length), 0, { ...m });
  }
  return { version: 1, modules };
}

/** Rows to draw: a full module alone, or two consecutive half modules side by side (a lone half takes its own row). */
export function layoutRows<T extends { width: ModuleWidth }>(modules: T[]): T[][] {
  const rows: T[][] = [];
  for (const m of modules) {
    const last = rows.at(-1);
    if (m.width === "half" && last && last.length === 1 && last[0].width === "half") last.push(m);
    else rows.push([m]);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// Editing (the "Personalizar" mode): pure operations on a layout; each returns a new, normalised layout.

/** Modules not in the layout, in catalogue order: what "Añadir módulo" offers. */
export const availableModules = (l: Layout): ModuleSpec[] => MODULE_IDS.filter((id) => !l.modules.some((m) => m.id === id)).map((id) => MODULE_SPECS[id]);

/** Moves the module at `from` to position `to` (indexes in the layout's order). */
export function moveModule(l: Layout, from: number, to: number): Layout {
  if (from === to || from < 0 || to < 0 || from >= l.modules.length || to >= l.modules.length) return l;
  const modules = [...l.modules];
  const [m] = modules.splice(from, 1);
  modules.splice(to, 0, m);
  return { version: 1, modules };
}

/** Removes a module, unless it cannot be removed («Para revisar»). */
export const removeModule = (l: Layout, id: ModuleId): Layout =>
  MODULE_SPECS[id].removable ? { version: 1, modules: l.modules.filter((m) => m.id !== id) } : l;

/** Adds a module at the end, at its first allowed width; no-op if it is already there. */
export const addModule = (l: Layout, id: ModuleId): Layout =>
  l.modules.some((m) => m.id === id) ? l : { version: 1, modules: [...l.modules, { id, width: MODULE_SPECS[id].widths[0] }] };

/** Sets a module's width if the module allows it. */
export const setModuleWidth = (l: Layout, id: ModuleId, width: ModuleWidth): Layout =>
  MODULE_SPECS[id].widths.includes(width) ? { version: 1, modules: l.modules.map((m) => (m.id === id ? { ...m, width } : m)) } : l;

export const sameLayout = (a: Layout, b: Layout) => JSON.stringify(a.modules) === JSON.stringify(b.modules);

/** Merges settings into a module (only those it takes; invalid values dropped). */
export const setModuleSettings = (l: Layout, id: ModuleId, patch: ModuleSettings): Layout => ({
  version: 1,
  modules: l.modules.map((m) => {
    if (m.id !== id) return m;
    const settings = normalizeSettings(id, { ...(m.settings ?? {}), ...(normalizeSettings(id, patch) ?? {}) });
    return settings ? { ...m, settings } : { id: m.id, width: m.width };
  }),
});

// ---------------------------------------------------------------------------------------------------------------
// Which layout a case draws: its own (personalised for that case), else its template's, else the team's, else the
// original. Each stored layout is normalised.

export type LayoutSource = "case" | "template" | "team" | "default";

export function resolveCaseLayout(stored: { caseLayout?: unknown; templateLayout?: unknown; teamLayout?: unknown }): { layout: Layout; source: LayoutSource } {
  if (stored.caseLayout) return { layout: normalizeLayout(stored.caseLayout), source: "case" };
  if (stored.templateLayout) return { layout: normalizeLayout(stored.templateLayout), source: "template" };
  if (stored.teamLayout) return { layout: normalizeLayout(stored.teamLayout), source: "team" };
  return { layout: DEFAULT_LAYOUT, source: "default" };
}
