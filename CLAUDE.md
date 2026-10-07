# credIA — project context for Claude Code

## What we're building
credIA turns a Spanish SME's financial data into a **credit data package** for alternative lenders
(invoice-financing funds, non-bank SME lenders, Madrid/Barcelona beta) in minutes.

**Wedge: data package with financials + KPIs.** credIA does NOT score or make credit decisions.
The lender decides; credIA packages, normalises, computes and cross-checks. Never add scoring,
approve/decline, or rate recommendations without an explicit product decision.

Out of scope for MVP: scoring, PSD2 aggregators, bureau API integrations (ASNEF/RAI, Informa), Holded OAuth,
autónomos (natural persons → EU AI Act high-risk; only legal entities with a CIF).

**Product decision (Sep 2026): informe de solvencia.** Commercial credit reports (Experian, Informa, Axesor,
Iberinform…) are accepted as an **uploaded PDF**, by the company or by the lender. The provider's own rating,
probability of default and recommended credit limit are extracted and shown **attributed to the provider**; credIA
never computes, combines or uses them in checks. Still no bureau API integration.

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind · Supabase (Postgres, Auth, Storage, RLS) ·
Vercel · Zod · Vitest · Claude API (structured output) for PDF extraction only.

## Core flow
Lender creates a case → borrower gets a magic link → borrower uploads documents and/or connects
Holded → pipeline: `ingest → classify → parse → normalise (PGC) → canonical → KPIs → checks → memo`.

## Data inputs (priority order)
| Input | Parser | Notes |
|---|---|---|
| Sumas y saldos (xlsx/csv) | Deterministic, per-software template (A3, Sage, Contasol, Holded, Odoo) | LLM only for header/column detection |
| **Holded API (borrower-supplied key)** | `src/lib/connectors/holded.ts` | Produces the same `LedgerBalance[]` as a trial balance upload |
| Norma 43 | Deterministic fixed-width parser + rule classifier (`src/lib/bank/classify.ts`) | LLM later, only for unclassified movements |
| Bank movements as Excel/CSV | Deterministic header detection (`src/lib/parsers/bank-sheet.ts`) | Same accounts as Norma 43; used only if they add up |
| Bank statement PDF | Claude structured output → Zod (`BankStatementWire`), page windows | Same accounts as Norma 43; used only if they add up |
| Modelo 200 PDF | Claude structured output → Zod (`Modelo200Wire`) | Verification anchor for closed year; its balance + P&L pages build the closed year when nothing better exists |
| Modelo 303 PDFs (IVA) | Claude structured output → Zod (`Modelo303Wire`) | Last 4 quarters due (or 12 monthly returns); requested with the Modelo 200 as «Documentos fiscales»; revenue-only periods |
| Cuentas anuales PDF (official model) | Claude structured output → Zod (`AnnualAccountsWire`) | Full balance + P&L, current and prior year; closed-year statement when there is no TB/Holded |
| CIRBE PDF | Claude structured output → Zod | Debt exposure |
| AEAT / TGSS certificates | Claude structured output | Validity + status |
| Informe de solvencia PDF (Experian, Informa…) | Claude structured output → Zod (`SolvencyWire`) | Company or lender uploads; incidents, judicial, provider figures |
| BORME | Fetch + parse | Officers, capital changes, insolvency |

**Rule: every number carries a `source_ref`** (document id + page/row, or `holded:ledger:<start>..<end>:acct:<account>#sync:<id>`).
No number without provenance reaches the UI or the memo.

## Holded connector (API key from the borrower)
Holded API **v2** (v1 is deprecated). Base `https://api.holded.com`, header `Authorization: Bearer <key>`.
Keys are created by the borrower in Holded (Settings → Developers → API → Add API Token) with
selectable permissions. Required scopes (read-only):
- `accounting:chart-of-accounts.read` → `GET /api/v2/accounting-accounts` (number, name, group, debit, credit, balance; filters `start_date`, `end_date`, `include_empty`, `archived`)
- `accounting:daily-ledger.read` → `GET /api/v2/ledger-entries` (required `start_date`, `end_date`; cursor pagination `cursor`/`has_more`; `limit` ≤ 200; optional `account`)
- Optional later: treasury read → `GET /api/v2/treasury/accounts`, `/{id}/bank-movements` (verify scope name)

Implementation (built — `src/lib/connectors/holded.ts`, `holded-sync.ts`, route `src/app/api/borrower/[token]/holded/route.ts`,
UI `src/components/ConnectHolded.tsx`):
1. **Trial balance is computed from ledger lines**, summed by account — not from the chart-of-accounts
   balance field (its period semantics are unverified). The chart is used for account names and an
   informational P&L reconciliation (`holded_chart_mismatch`).
2. **Pre-closing TB:** `classifyEntries` excludes closing and regularisation entries, detected by
   `type` (configurable `DEFAULT_CLASSIFIER`), description regex, or structure (6/7 ↔ 129 for
   regularisation; a balance-sheet-only last-day entry cancelling ≥80% of running balances for closing).
   Opening entries are kept. Post-checks: `holded_closing_entries_suspected`, `holded_tb_unbalanced`.
   **Week 1: verify real `type` values against a Holded account and update `DEFAULT_CLASSIFIER`.**
3. **Missing opening entry** (year never closed in Holded): opening balances are rebuilt from ledger
   history before FY start (closing entries and their mirrored openings dropped; unpaired opening =
   migration entry, kept) → warning `holded_opening_reconstructed`.
4. Periods (`periodsFor`): closed FY from `cases.fiscal_year_end`; YTD = next day → today (skipped if < 28 days).
5. HTTP: 429/5xx retried with `Retry-After` or exponential backoff; 401 → `invalid_key`; 403 → `missing_scope`
   with the Spanish permission label (`SCOPE_LABELS_ES`). `verifyHoldedKey` probes both scopes first.
6. **Token handling:** never logged or echoed in errors. `one_time` (default): key lives in memory for the
   request only and is never stored. `refresh`: sealed with AES-256-GCM (`src/lib/crypto/token.ts`,
   AAD = connection id, key `CREDIA_ENCRYPTION_KEY`). Encrypted columns are not selectable by clients.
7. Raw ledger lines + exclusion decisions stored at `raw/holded/<case>/<sync_id>.json` (bucket `case-files`).
8. Sync runs inside the request (`maxDuration = 300`). Move to a background job once real books need it.

## BORME (Registro Mercantil)
Built — `src/lib/borme/` (pure: `parse.ts`, `names.ts`, `sumario.ts`, `profile.ts`, `rows.ts`, `ondemand-plan.ts`;
network: `fetch.ts`; DB: `ingest.ts`, `ondemand.ts`, `case.ts`, `watch.ts`), cron `src/app/api/cron/borme/route.ts`,
UI `src/components/case/RegistrySection.tsx`. **On demand, sized for the Supabase free plan (0013).**
1. **Light index only**: `borme_index` (one row per announcement: day, provincial PDF seq, entry number, company key,
   registry sheet; ~0.45 MB a day) + `borme_pdfs` (issue/seq/province per PDF). Kept for `BORME_RETENTION_MONTHS`
   (default 24; ~215 MB); the daily job prunes older days (`borme_days.status = 'pruned'`). The full copy
   (`borme_acts`, ~3 MB a day) was dropped: it filled the free plan.
2. Daily Vercel Cron (`vercel.json`, `CRON_SECRET`) indexes today + catches up the last 10 days. Backfill:
   `npm run borme:backfill` (defaults to the retention window). Live check without DB: `npm run borme:probe -- --day …`.
3. Index from the BOE open-data API (`/datosabiertos/api/borme/sumario/YYYYMMDD`, walked for `BORME-A-*` items);
   PDFs → text with `unpdf` → deterministic parser (entries by consecutive announcement number, acts by published
   label, registry sheet from "Datos registrales"). No LLM. Unknown text → warnings, never dropped.
4. **BORME has no CIF.** Candidates by `companyKey()` of the case name from the index; the company is its registry
   sheet (`V-123456`, stable across renames). **The lender confirms the match** (`case_borme_matches`). Confirming
   reads that sheet's acts **on demand** (`fetchSheetActs`: index → the few PDFs where it appears → parse →
   `borme_company_acts`; state in `borme_sheets`, "Consultando el BORME…" in the UI, retry on failure). Case page has
   `maxDuration = 300` for this. No BORME check runs before confirmation.
5. Checks (`bormeChecks`): insolvency, dissolution/extinction, closed sheet (high); capital reduction 24m, ≥2
   administrator changes 12m, address change 12m, incorporated < 24m (warn); `borme_no_adverse_acts` pass, stating
   the coverage start. source_ref `borme:<date>:<BORME-A id>:entry:<n>` links to the PDF on boe.es.
6. **Watching:** the daily import stores full acts for confirmed sheets (`watchedSheets`); `notifyNewActs` flags new
   ones in the Bandeja (`borme.new_acts`, `borme_days.notified_at`) and reprocesses the case. Backfilled days never notify.
   The committee PDF and the JSON export include the Registro Mercantil section.
7. Verified against the live BORME (29 Sep 2026: 2,215 entries; 12 Mar 2025: 2,922 entries, ~15 s per day): every
   published label recognised, ~0.1 % of entries without a usable sheet. Real-world shapes in
   `BORME_A_REAL_SHAPES_TEXT`. In the cloud sandbox Node's fetch needs `NODE_USE_ENV_PROXY=1`.

## Informe de solvencia
Kind `solvency_report` (0012): optional requirement (default max age 90 days) the lender can ask the company for, and a
report the lender can upload itself from the case view (`prepareLenderUpload` / `registerLenderUpload`,
`uploaded_by = 'lender'`; the company's portal never shows lender uploads). Generic schema for any provider
(`SolvencyWire` → `SolvencyReportSchema`). Checks (`checkSolvencyReport`): active payment incidents (RAI,
ASNEF-Empresas, bureau) high; open concurso/embargo high, lawsuits and public-body claims warn; report revenue vs books
for the closed year (10 % / 5.000 €) warn. Provider rating / PD / limit: case view, PDF and JSON only, with the note
`PROVIDER_FIGURES_NOTE`. UI `src/components/case/SolvencySection.tsx`; copy `src/content/solvency.es.ts`.
Not yet tested against real provider PDFs: adjust the schema descriptions when the first real reports arrive.

## Cuentas anuales and "Lo subo yo"
- **Financials from cuentas anuales alone:** `AnnualAccountsWire` reads every line of the official model (normal,
  abreviado, PYMES; current and prior column; units scaled in `assess.ts`). `statementFromAnnualAccounts`
  (`src/lib/pgc/annual-accounts.ts`, pure, tested with `__fixtures__/annual-accounts.ts`) maps model headings onto the
  canonical lines and computes subtotals with the same `assembleStatement` as the TB mapping. Lines not named are
  reconciled against printed totals (residual → the block's "other" line; operating residual kept out of EBITDA) and
  mismatches become `ca_*` warnings. Lineage labels are model lines (not account codes) with `doc:<id>:page:<n>`.
  Financial expenses are taken as interest (said in the lineage).
- **Ranking:** in `recompute`, the closed year uses trial balance / Holded (newest wins) and falls back to the
  annual accounts (`financial_statements.source = 'annual_accounts'`, 0014), then the Modelo 200 (`'modelo200'`, same
  model, `m200_*` warnings), then the Modelo 303 (`'modelo303'`); the YTD falls back to the Modelo 303 (FY start to the
  last month covered without gaps, ≥ 1 quarter). The summary says which. `src/lib/pgc/tax-returns.ts`, 0016.
- **Revenue-only statements** (`scope: "revenue"`, Modelo 303): `pnlAvailable` false, only revenue is known (sales
  declared = accrued bases + 59/60/120/122). KPIs give revenue only (rest null with a note); tables blank every other
  line; KPI tiles, balance bars, Sankey and balance-sheet checks (CIRBE, debt payments) use `isFullStatement` only.
- **"Lo subo yo"** (`case_requirements.source = 'lender'`, 0017; was "Por CIF"/'cif' in 0014): third option in the
  new-case form, for every document kind. The analyst uploads it from the case view (`LenderDocumentsSection`, or
  `AnnualAccountsSection` / `SolvencySection` for those two; any format the portal accepts, several files where the
  portal allows them). Not shown to the company, not in its completeness; "Pedir a la empresa" (`requestDocument`)
  hands it back. The invitation email lists only the company's documents; with none, the company is not invited
  ("Nuevo enlace" invites it later). `isLenderProvided` also reads legacy 'cif'. A contracted provider could later fetch
  a PDF by CIF and register it like a lender upload.
- **Who a case waits on** (`src/lib/cases/attention.ts`, pure): the case status follows the company and processing;
  the analyst's missing required uploads show as a second pill «Te toca subir · N» (case list and header). A case with
  no company documents is marked submitted once the analyst's required ones are in (`analystCompletesCase`, in
  `recompute`) and moves on to processing → ready. Case list filters (`?filtro=`): todos, atencion (analyst owes
  documents, ready, needs_review), empresa (waiting on the company), procesando.

## Modular case view
The case view body is a list of **modules** drawn from a **layout** (BI-style dashboard). Registry and layout format:
`src/lib/case-view/modules.ts` (pure, tested): `MODULE_SPECS` (id, title, description, `removable`, allowed widths
full/half), `DEFAULT_LAYOUT` (today's order), `normalizeLayout` (any stored JSON → safe layout: unknown/repeated
modules dropped, widths the module allows, «Para revisar» always present), `layoutRows` (two consecutive halves share
a row; a half that draws nothing collapses and its partner takes the row). Components: `src/components/case/modules/CaseModules.tsx` (one component per module, each renders nothing
when empty). The header and the evidence panel are not modules.
Decided defaults: team template per lender (owners/editors edit), product templates and personal overrides later;
rows of full or half width (no free grid); «Para revisar» movable, not removable; the committee PDF follows the
layout; Excel/JSON exports stay complete. Phases: 1 registry + default layout ✅ · 2 team template + edit mode ✅
· 3 process templates ✅ (see Plantillas), PDF follows layout ✅, module settings ✅, personal layouts (later, if asked)
· 4 new modules (303 quarterly sales, CIRBE by bank/maturity, N43 monthly flows, closed vs YTD).
**PDF follows the layout** (`packagePdf(…, layout)`, export route uses `loadCaseLayout`): modules in layout order, half
widths printed full width, `analyst_documents` / `annual_accounts` print nothing, financial statements always as an
appendix. **Module settings** (`LayoutModule.settings`, `MODULE_SETTINGS`, `normalizeSettings`, `moduleSettings`):
«Resumen» `facts` (≥ 1 of `SUMMARY_FACT_IDS`: revenue, EBITDA, CIRBE vs books by default; net income, YTD sales, net
debt, equity, working capital; fixed sentence order, source notes always said; `summaryView`), «Indicadores» (repeatable: up to `MAX_INSTANCES` copies, each with its own `key` — `kpis-2`… — width and settings;
`moduleKey` identifies a module in its layout, the first copy's key is its id; full width shows 5 tiles, half width 3,
`maxKpiTiles`; opened from a case, the designer marks tiles that case has no data for «Sin datos en este caso», still
selectable) `tiles` (1–5 of `KPI_TILE_IDS`, default the original five; extra tiles revenue, EBITDA+margin,
debt/equity, working capital, financial debt, gross margin (+net), net margin, ROE (+ROA), EBIT coverage, debt/EBITDA,
liabilities/equity, cash conversion cycle (+DIO), asset turnover, and one per bank KPI, from `kpiTiles` + `pickTiles`), «Cuenta de resultados»/«Balance» `period`
(base | closed | ytd → `periodView`), «Para revisar» `showPassed`. Edited in the designer («Ajustes» on the tile),
applied in the case view and the PDF. Every tile explains itself (`src/content/kpi-explain.es.ts`, one plain-language line
per `KpiTileId`, descriptive only): at the top of its popover and as the tooltip of its button in the designer.
Phase 2: `dashboard_layouts` (0018; one `scope = 'team'` row per lender, read by members, written by owners and
analysts via `is_lender_editor`, never viewers; `tests/integration/layouts.test.ts`). `loadTeamLayout`
(`src/lib/case-view/layout-store.ts`) → `normalizeLayout`. Editor: `?personalizar=1` on the case page
(`LayoutEditor`, dnd-kit sortable tiles with keyboard drag, plus up/down, width, remove, «Añadir módulo»); actions
`saveTeamLayout` / `resetTeamLayout` (`src/app/casos/layout-actions.ts`, normalise, audit `layout.saved/reset`).
Edit operations are pure in `modules.ts` (`moveModule`, `removeModule`, `addModule`, `setModuleWidth`).

## «Preguntar al caso» (analyst chat) and conclusions
Ad-hoc questions about one case from the case view (`src/lib/analyst-chat/`, 0022). Read-only and descriptive: the
prompt forbids scores, approve/decline, rates, limits; provider rating/PD/limit only attributed (`PROVIDER_FIGURES_NOTE`).
- **Tools, not raw data** (`tools.ts`, pure, Zod-validated input; bad input → an error the model corrects): statements
  (+ accounts), KPIs (closed/YTD/bank, formula + inputs), checks (+ evidence, review), bank movements search and
  aggregate (`bank_transactions`, loaded on first use), CIRBE positions, BORME (only once the match is confirmed),
  solvency report, and `compute` (+ − × ÷ over figures a tool returned, by ref; `calc.ts`, no eval). All reads go through
  the analyst's RLS client (`loadCaseView`), so the chat sees exactly what the case view shows.
- **Every figure cited** (`refs.ts`): tools register each figure under a stable handle (`r` + 8 base-36, FNV of an id
  like `kpi:closed_fy:ebitda` or a source_ref) with label, value, source_ref and link; the model writes
  `[[ref:<handle>]]` after each figure. `validateAnswer` drops handles no tool returned and lists sentences with a figure
  (thousands/decimals or a %/€ unit; dates, years and bare integers are not figures) not followed by a citation; the chat
  shows «Sin origen». Follow-ups may reuse earlier answers' citations unless the case was reprocessed since.
- **Loop** (`run.ts`, client injected; tests use a scripted fake): streamed rounds, all tool results of a round in one
  user message, ≤ `MAX_ROUNDS` (6), the last with `tool_choice: none`; `modelFor("analyst")` (`CREDIA_ANALYST_MODEL`,
  default claude-opus-5-5) at effort medium, server-side refusal fallback, cached tools + stable prompt (`prompt.ts`), then
  a figure-free case snapshot. Route `POST/DELETE /casos/[id]/preguntar` (NDJSON events `protocol.ts`: delta, status,
  done, error); 60 questions/hour per analyst; audit `case.question_asked` (tools, counts; never the text).
- **Threads are private** (`analyst_messages`: RLS same lender and `user_id = auth.uid()`; viewers may ask). UI
  `AnalystChat` (assistant bar at the bottom of the case view, suggestions from `chatSuggestions`), `CitedText`
  (numbered chips with tooltip and link, numbered sources).
- **Conclusions** (`case_conclusions`, members read, owners/analysts write): «Guardar como conclusión» on an answer,
  editable with `[n]` markers (`toEditable`/`fromEditable`); `saveConclusion` reads the answer back from the analyst's
  thread (citations never come from the browser) and refuses text with an uncited figure (`prepareConclusion`). Not a
  module: `ConclusionsSection` after the modules, always in the PDF (after the modules, before the statements appendix),
  Excel sheet «Conclusiones» and JSON `analyst_conclusions` (text with `[n]`, sources with source_ref). Audit
  `conclusion.saved/removed`.
- Not yet: checked against the live API (golden questions over the fixtures), portfolio questions across cases.

## Process templates («Plantillas»)
A template = name, description, optional default product, document choices (`[{kind, level: required|optional|lender,
maxAgeDays}]`) and optionally its own case-view layout (`case_templates`, 0019; members read, owners/analysts write).
Pure model `src/lib/cases/templates.ts` (`parseTemplateForm`, `normalizeTemplateRequirements`, `templateFormValues`);
store `template-store.ts`; pages `/plantillas`, `/plantillas/nueva`, `/plantillas/[id]` (form ends with «Panel estándar» /
«Panel personalizado»; choosing personalizado opens the designer after saving; `?panel=1` = its layout
editor); actions `src/app/plantillas/actions.ts`. The new-case form's «Plantilla» select fills product and documents
(still editable; `RequirementsPicker`, shared with the template form, posts `req_*`/`age_*` → `parseRequirementFields`)
and stores `cases.template_id` (trigger: same lender; `on delete set null`). Documents are copied into the case at
creation; template edits never change existing cases' documents.
**Which layout a case draws** (`resolveCaseLayout`, `loadCaseLayout`): `cases.layout` (this case only) → the template's
→ the team's (`dashboard_layouts`) → `DEFAULT_LAYOUT`. The editor from a case saves to «Solo este caso» (default),
«La plantilla …» or «Todo el equipo» (`saveLayout(target)` / `resetLayout(target)` in `src/app/casos/layout-actions.ts`);
«Volver al diseño de la plantilla/del equipo» clears the case's own. Integration: `tests/integration/templates.test.ts`.

## Bank movements (Norma 43)
`parseNorma43` reads the fixed-width records; `classifyAccounts` (`src/lib/bank/classify.ts`, pure) gives every movement a
category, its basis and the rule that decided (`categoryBasis`, `categoryRule`). Evidence, strongest first: **pair** (same
amount out of one of the company's accounts and into another within 3 days → `internal_transfer`), **holder** (the
company named as payer of an inflow / payee of an outflow; never "a favor de", which banks print on every incoming
transfer), **text** (Spanish banking phrases, ordered rules), **code** (AEB common concept), **default**
(`other_inflow` / `other_outflow`). `recompute` classifies all of a case's bank files together (rule changes reach old
files; pairs across files). Inflows that are not sales — `internal_transfer`, `financing`, `trade_finance`, `equity`,
`refund`, `investment_income`, `reversal` — never count as receipts (`inflowBreakdown`); unclassified inflows count but
are reported. **Other formats** (document kind `norma43` too): Excel/CSV exports (`parseBankSheets`: header row by
Spanish column names — fecha, concepto, importe or cargo/abono, saldo —, IBAN and holder from the lines above) and PDF
statements (`extractBankStatement` reads 4-page windows with the document cached; `statementFromPdf` merges them, checks
type and NIF). Both become `N43Account`s through `src/lib/bank/statement.ts` and must **add up**: rows put in date order
(newest-first detected from the running balances), opening = printed or first balance − its movement, every running
balance and the closing balance must follow; otherwise the document is `needs_review` and nothing from it is used.
Exports without balances give flows only (`balancesKnown: false`: balance KPIs null, overdraft check skips them).
Source refs `doc:<id>:row:<n>` / `sheet:<s>:row:<n>` / `page:<n>`. PDFs recorded as pending before (parser
`n43:pdf@0`) are read on the case's next run. Fixtures `__fixtures__/bank-statements.ts` (hand-written shapes).
**Whose account** (`src/lib/bank/holder.ts`; companies only): a DNI/NIE as the holder's ID (PDF `holder_id`/NIF, or
next to «Titular»/NIF in an export) → the file is rejected («cuenta personal»). A holder name that is clearly not the
company (`holderVerdict`, legal forms dropped, cut names allowed) → its accounts stay out of every bank figure and check,
with the warn check `bank_holder_mismatch` (`bankHolderCheck`); marking it «Revisada» confirms them (accounts uploaded
before the review count; `reviewCheck` reprocesses the case). No holder or no company name → used.
**Not yet checked against real exports or PDFs from Spanish banks, nor the PDF path against the live API.**
Fixture `__fixtures__/n43-two-banks.ts` (two banks, hand-written concept shapes, every movement's
expected category). **Not yet checked against real exports from Spanish banks: add their concept shapes as tests.**

## PGC normalisation
- Roll every account up to its **3-digit PGC code** (`4300001` → `430`, `70500001` → `705`).
- Groups 46/47/55: classify by sign (debit → asset, credit → liability).
- If P&L groups (6/7) are still open (pre-closing TB), add their net to equity as current-year result.
- Support PGC normal and PGC Pymes (same 3-digit codes for everything we use).
- Mapping lives in `src/lib/pgc/mapping.ts` — pure, unit-tested. Change it only with tests.

## KPIs (`src/lib/kpis/engine.ts`, pure functions)
EBITDA, revenue, EBITDA margin, current ratio, quick ratio, working capital, financial debt,
net debt, net debt/EBITDA, debt/equity, interest coverage, DSCR, DSO, DPO; also coverage with EBIT, gross financial
debt/EBITDA, total liabilities/equity, gross margin (revenue − 60/61), net margin, ROA, ROE (closing balances), DIO,
cash conversion cycle (DSO + DIO − DPO from the rounded days) and asset turnover (`UNIT` lists them all). Flows annualised by
`months`. DSO/DPO gross-up VAT via `vatRate` (default 0.21). Each KPI returns `value`, `formula`,
and `inputs` so the UI can show its derivation. Division by zero/negative denominators → `null` + reason.

**Adjusted gross margin** (`src/lib/kpis/cost-of-sales.ts`, pure): the accounting gross margin takes cost of sales as
60/61 only, and the PGC does not separate direct from indirect costs, so the analyst defines cost of sales per case
(`case_cost_definitions`, 0021; members read, owners/analysts write): selectors `line:<expense line>`, PGC prefixes
(`640`, `62100000`; ledger statements) or `label:<model line>` (annual accounts), from a preset (Comercio = 60/61,
Industria + personal/621/622/624/628, Servicios + personal/623). Computed when the case is read (`load.ts`, no
reprocess), shown as the analyst's (or template's) criterion next to the accounting figure: tiles «Margen bruto»
(sub: ajustado) and «Margen bruto ajustado» (sub: contable); the JSON export lists every account taken with its
source_ref. Editor `/casos/[id]/coste-de-ventas` (`CostOfSalesEditor`, actions `src/app/casos/cost-actions.ts`, audit
`cost_of_sales.saved/reset`), linked from both margin tiles. Templates carry a default (`case_templates.cost_of_sales`,
lines and 3-digit groups) copied into each new case (`source = 'template'`).

**Bank KPIs** (`src/lib/kpis/bank.ts`, pure, `computeBankKpis`): read from the classified Norma 43 movements, all of a
case's files together, over the last 12 months up to the latest day covered (end-of-day balances combined across
accounts; consecutive files of one account joined; an account not covering the window keeps its opening/closing balance
there, said in `coverageNote`). Minimum and average daily balance, current vs 90-day average, days of cash, operating
cash flow per month, net burn in negative months, inflows/outflows (90 days, no own transfers), volatility of monthly
receipts, receipts per month, debt service burden, payroll regularity, returned items, overdraft days, returned
receipts ratio, public refunds share, own-transfer share. Computed in `recompute`, stored in `cases.bank_kpis` (0020,
`{ period, accounts, sources, coverageNote, kpis }`), shown as «Indicadores» tiles (`BANK_KPI_TILE_IDS`, grouped «De
los extractos bancarios» in the designer; a tile without data is not drawn), and in the JSON/Excel exports. Not yet
built (need counterparties or more history): customer concentration, recurring revenue mix, fixed vs variable costs.

## Cross-checks (`checks` table; severity info|warn|high)
TB revenue vs N43 customer receipts (±25%; excluded inflows listed by type) · N43 loan/advance drawdowns vs declared debt (`n43_financing_inflows`) · TB financial debt vs CIRBE · closed-year TB vs Modelo 200 (revenue,
result, equity) · recurring debt payments in N43 vs declared debt · AEAT/TGSS certificates valid ·
BORME adverse acts · Modelo 303 last 4 quarters received (`m303_quarters`, warn) · Modelo 303 declared sales vs revenue of a period they cover month by month (`m303_vs_books_revenue`, 10 % / 5.000 €, warn) · solvency-report incidents and revenue vs books · Holded chart vs ledger reconciliation ·
closing-entries suspicion · bank accounts held by someone other than the company (`bank_holder_mismatch`, warn).

## Conventions
- Money as `number` in euros inside the engine; parse decimal strings with `toNumber()`; round only for display.
- All parsers return `{ data, warnings }`; never throw on bad business data, throw on programmer errors.
- Zod-validate every LLM output; on failure retry once, then mark the document `needs_review`.
- RLS on every table by `lender_id`; borrower access only through signed case tokens via server routes.
- Tests: `npm test` (Vitest). Every parser and KPI change needs a test with a realistic fixture
  (`src/lib/__fixtures__/`: `tb-small-sl.ts` hand-checked TB; `holded-fake.ts` in-memory Holded API).
- Integration tests: `npm run test:integration` against a **local** Supabase (`npx supabase start`; refuses any
  non-localhost URL). `tests/integration/rls.test.ts` checks tenant isolation table by table: **every new
  case-scoped table needs RLS by `lender_id`, a lender-match trigger (see `0008_lender_match_everywhere.sql`) and a
  row in `CASE_ROWS`**. `links.test.ts` covers magic-link expiry/replacement/revocation and read auditing.
- Migrations: applied to the live project by `.github/workflows/supabase-migrations.yml` (`supabase db push` on push
  to main touching `supabase/migrations/`; secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; also runnable by
  hand from the Actions tab). By hand only with `supabase db push`, never through the Supabase MCP tool (it records
  them under timestamp versions and the history drifts). Code and migration go live together: Vercel may serve new code
  a minute before the migration finishes, so keep migrations compatible with the code before them where you can.
- E2E: `npm run test:e2e` (Playwright, local Supabase, dev server on :3100): lender creates a case → company uploads
  TB + Norma 43 → lender sees the package; an all-«Lo subo yo» case (no invitation, pill, filter, moves on after the
  analyst's upload); the team personalises the case view and restores it; a template pre-sets a case's documents and
  dashboard, with a case-only layout and back. `PW_CHROMIUM_PATH` to reuse an installed Chromium.
- Processing runs after the response (`after()`, pages/routes with `maxDuration = 300`). A run can die (time limit,
  deploy, read-only database): `stuckReason` (`src/lib/pipeline/stuck.ts`) spots stuck cases and they are re-run when
  the case or the case list is opened and in the daily cron's sweep; pages auto-refresh while something is processing.
- Lender reads of case data are audit-logged (`logCaseRead`, deduped per 15 min); exports and document opens too.
- Imports inside `src/lib` use explicit `.ts` extensions (`allowImportingTsExtensions`); app code may use `@/`.

## Design language v2
Specs: `design/lender-case-view2.html`, `design/borrower-flow2.html`. Tokens in `src/app/globals.css` (`@theme`);
primitives in `src/components/ui/` — use them instead of ad-hoc styles.
- **No cards, no borders as structure.** Hierarchy from type size, whitespace and soft fills (`bg-soft`). Hairlines
  (`border-hairline`) only inside tables and panels. Only floating layers are elevated (`shadow-float`): evidence
  panel, assistant bar, popovers, sheets, modals.
- Colour: ink text on white; accent `#0E5A61` for progress, links, focus and the assistant — never primary buttons.
  Buttons: primary = ink pill, secondary = soft pill, tertiary = accent link. `faint` is decorative only.
- Status and severity = pill with a 6px dot (`Pill`, `SeverityDot`), never a coloured box.
- Type: Geist for text, **Geist Mono for every figure, code and ID** (`Figure`: mono number + muted unit, Spanish
  formatting). Page headings 30–34px/600/−0.03em (`heading-page`), section titles 17px/600 (`heading-section`).
- Radii: pills full; rows/inline panels 14–16px; inputs 14px; drop zones and floating panels 24–28px.
- Inputs: soft fill, no border, 44px min height, 2px accent focus ring. Targets ≥ 44px.
- Lists, not cards: `ListRow` with hover/selected soft fill and negative margin so text aligns with headings.
- States: loading = `Skeleton` soft blocks; errors = one line with a high/warn pill (`ErrorLine`); no alert boxes.
- Tooltips: `Tooltip` (`src/components/ui/Tooltip.tsx`: title + explanatory line, hover/focus, Esc) — never a native `title`.
- Icons: lucide-react, stroke 1.8–2. No emoji or ✓ glyphs. Motion 150–200ms ease-out; honour reduced motion.
- Spanish UI copy lives in `src/content/`; bracketed placeholders like `[RUTA …]` stay until real paths exist.
- The PDF export (`src/lib/case-view/pdf.tsx`) mirrors these rules with vendored Geist TTFs.

## Build order
W1: scaffold + auth + RLS + case/upload flow · TB parser + PGC mapping · canonical schema + KPI engine
W2: Holded connector ✅ (starter) — wire into borrower page, verify against a real account · N43 parser · LLM extractors (Modelo 200, CIRBE, certificates) · checks engine
W3: BORME ✅ (on demand, 0013) · case view with drill-down to source · memo PDF · audit log · beta onboarding
