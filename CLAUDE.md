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
| Norma 43 | Deterministic fixed-width parser | LLM for transaction categorisation |
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

## PGC normalisation
- Roll every account up to its **3-digit PGC code** (`4300001` → `430`, `70500001` → `705`).
- Groups 46/47/55: classify by sign (debit → asset, credit → liability).
- If P&L groups (6/7) are still open (pre-closing TB), add their net to equity as current-year result.
- Support PGC normal and PGC Pymes (same 3-digit codes for everything we use).
- Mapping lives in `src/lib/pgc/mapping.ts` — pure, unit-tested. Change it only with tests.

## KPIs (`src/lib/kpis/engine.ts`, pure functions)
EBITDA, revenue, EBITDA margin, current ratio, quick ratio, working capital, financial debt,
net debt, net debt/EBITDA, debt/equity, interest coverage, DSCR, DSO, DPO. Flows annualised by
`months`. DSO/DPO gross-up VAT via `vatRate` (default 0.21). Each KPI returns `value`, `formula`,
and `inputs` so the UI can show its derivation. Division by zero/negative denominators → `null` + reason.

## Cross-checks (`checks` table; severity info|warn|high)
TB revenue vs N43 inflows (±25%) · TB financial debt vs CIRBE · closed-year TB vs Modelo 200 (revenue,
result, equity) · recurring debt payments in N43 vs declared debt · AEAT/TGSS certificates valid ·
BORME adverse acts · Modelo 303 last 4 quarters received (`m303_quarters`, warn) · Modelo 303 declared sales vs revenue of a period they cover month by month (`m303_vs_books_revenue`, 10 % / 5.000 €, warn) · solvency-report incidents and revenue vs books · Holded chart vs ledger reconciliation ·
closing-entries suspicion.

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
  TB + Norma 43 → lender sees the package. `PW_CHROMIUM_PATH` to reuse an installed Chromium.
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
- Icons: lucide-react, stroke 1.8–2. No emoji or ✓ glyphs. Motion 150–200ms ease-out; honour reduced motion.
- Spanish UI copy lives in `src/content/`; bracketed placeholders like `[RUTA …]` stay until real paths exist.
- The PDF export (`src/lib/case-view/pdf.tsx`) mirrors these rules with vendored Geist TTFs.

## Build order
W1: scaffold + auth + RLS + case/upload flow · TB parser + PGC mapping · canonical schema + KPI engine
W2: Holded connector ✅ (starter) — wire into borrower page, verify against a real account · N43 parser · LLM extractors (Modelo 200, CIRBE, certificates) · checks engine
W3: BORME ✅ (on demand, 0013) · case view with drill-down to source · memo PDF · audit log · beta onboarding
