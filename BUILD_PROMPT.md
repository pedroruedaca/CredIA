# Build prompt for Claude Code — credIA MVP

Paste everything below the line into Claude Code, run from the repo root. It works phase by phase
and stops for review after each phase.

---

You are building the credIA MVP in this repository. Read these first, in this order, and follow them:

1. `CLAUDE.md` — product rules, architecture, conventions. It overrides anything below if they conflict.
2. `design/lender-case-view.html` and `design/borrower-checklist.html` — the approved screen designs.
   They are static mockups in a custom component format: ignore `<x-dc>`, `<helmet>`, `support.js` and the
   `<script type="text/x-dc">` block. Use only the markup, copy, layout and inline styles as the visual spec.
3. The existing code in `src/lib/` (PGC mapping, KPI engine, Holded connector, crypto) and
   `supabase/migrations/0001_init.sql`. It is tested. Reuse it; do not rewrite it. Change it only with tests.

## Ground rules

- Next.js App Router, TypeScript strict, Tailwind, Supabase, Zod, Vitest. Server Components by default;
  client components only where interaction needs them.
- All borrower-facing copy is in Spanish (tuteo, plain language). Lender UI is also Spanish.
- credIA never scores, recommends, or predicts approval. No UI element, API field or assistant reply may do so.
- Every number shown to a lender carries provenance (`sourceRef`) and must be drillable to account + document.
- Never log or return secrets (Holded keys, tokens). Borrower routes use the magic-link token, validated server-side.
- Placeholders in the designs (`[BANCO]`, `[RUTA …]`, `[AÑO]`, `[EMAIL DE SOPORTE]`) stay as data in a content
  file (`src/content/`), never hard-coded, and never invented.
- After each phase: `npm run typecheck && npm test` must pass, then commit with a clear message, then STOP and
  give me a short summary: what was built, what's stubbed, what I need to do (env vars, Supabase setup).
- If something is ambiguous, pick the simplest option consistent with CLAUDE.md, note it in the summary, carry on.

## Design tokens (extract into `tailwind` theme / CSS variables)

- Ground `#F5F4EF`, surface `#FFFFFF`, subtle surface `#FBFAF7`, line `#E3E1D8`, row line `#EFEDE6`
- Ink `#17191E`, ink-2 `#4A4E57`, muted `#5E626B`
- Accent `#0E5A61` (hover `#083B40`), accent tint `#EEF4F4`
- Severity: high text `#7E1F16`/icon `#A32A1F` on `#FBEAE6` · warn `#6B3F00`/`#8A5200` on `#FBF0DC` ·
  info `#163B6B`/`#1E4E8C` on `#E8EFF9` · ok `#1F6135` on `#E6F2EA`
- Fonts (next/font/google): Newsreader 500/600 for headings, IBM Plex Sans 400/500/600 for UI, IBM Plex Mono
  400/500 for every figure. Radii: cards 12px, inner blocks 10px, buttons 8px, chips full.
- Icons: inline stroke SVG components (lucide-react is fine). No emoji.
- Accessibility: real buttons/links/labels, focus rings, 44px touch targets, AA contrast.

## Phase 1 — App shell, auth, cases

1. Scaffold the Next.js app around the existing files (do not overwrite `src/lib`, `supabase/`, `CLAUDE.md`).
2. Supabase clients: server (cookies), browser, and service-role admin (server-only module).
3. Lender auth: email magic link via Supabase Auth; after sign-in, resolve the user's `lender_members` row.
   Add a seed script that creates one lender and links the signed-in user as owner.
4. Migration `0002`: `cases.requested_amount`, `requested_product`, `requested_term_months`, `borrower_email`,
   and a `case_requirements` table (case_id, doc_kind, required bool, max_age_days int null) so lenders can mark
   documents optional and set freshness rules (e.g. TGSS certificate ≤ 90 days).
5. Lender pages: `/casos` (list: company, CIF, status, % documents complete, updated) and `/casos/nuevo`
   (CIF with checksum validation, name, amount, product, term, fiscal-year end, borrower email, requirements).
   Creating a case generates the magic-link token (store only its SHA-256 hash + expiry, 30 days) and shows the
   link to copy. Email sending: stub behind an interface (`src/lib/notify.ts`), log in dev.
6. Header per `design/lender-case-view.html`.

## Phase 2 — Borrower portal (`/s/[token]`)

Build `design/borrower-checklist.html`:
1. Server-validate the token; invalid/expired → friendly Spanish page.
2. Co-branded header (lender name + initials badge, "Proceso gestionado con credIA").
3. Checklist driven by `case_requirements` + `documents` + `holded_connections`, with states:
   pending / in progress / done / needs attention (with the specific fix message). Progress bar "N de M".
   Exactly one item expanded at a time (the first incomplete); others collapse to a row.
4. Accounting item: two paths — `ConnectHolded` (exists in `src/components/`, restyle to tokens) or upload
   sumas y saldos (xlsx/csv).
5. Upload items: drag-and-drop to Supabase Storage bucket `case-files` via a server route (validate size ≤ 20 MB,
   type, SHA-256; insert `documents` row). Show filename + "leído correctamente" / error after processing.
6. Norma 43 item: bank chips (Santander, BBVA, CaixaBank, Sabadell, Bankinter, Otro) switching per-bank steps from
   `src/content/banks.es.ts` (placeholders until I fill them). Accept multiple files. Fallback copy: PDF statements.
7. "Enviar esta petición a mi gestoría": modal with the gestoría's email; creates a delegate link scoped to the same
   case (separate token, audit-logged).
8. Right column: "Qué compartimos y con quién" card (lender, purpose, Holded read-only/one-time, withdraw consent).
9. Submit button enabled only when all required items are done; sets case status `processing`.
10. Freshness checks at upload (e.g. certificate older than `max_age_days`) produce the needs-attention state.

## Phase 3 — Documentation assistant (borrower chat)

The chat panel in the right column of `design/borrower-checklist.html`.
1. `POST /api/s/[token]/assistant` streaming route using the Anthropic TypeScript SDK (`ANTHROPIC_API_KEY`),
   model from env `CREDIA_ASSISTANT_MODEL`.
2. Grounding, built server-side per request and passed in the system prompt:
   - the case checklist with each item's status and fix message (no financial figures, no KPIs, no checks);
   - lender name and requirement rules (e.g. max certificate age);
   - `src/content/docs-guide.es.md` — what each document is, why it's requested, how to obtain it,
     gestoría alternatives — and `src/content/banks.es.ts`.
3. Hard rules in the system prompt, and enforced by only passing the data above:
   - answer only about obtaining and uploading documents and using the portal;
   - never discuss financials, eligibility, approval chances, the lender's criteria beyond document rules;
   - never invent URLs, menu paths or phone numbers: if the guide lacks it, say so and offer "Hablar con una persona";
   - Spanish, short, numbered steps; may link to a checklist step with a `[[step:<doc_kind>]]` token the UI renders
     as a "Ir al paso N" link.
4. Opening message generated from the checklist ("Te faltan X, Y y Z. ¿Por cuál empezamos?"), suggested-question
   chips derived from pending items, "Hablar con una persona" → creates a support request row + notifies (stub).
5. Store conversations in `assistant_messages` (case_id, role, content, created_at) with RLS; rate-limit per token
   (e.g. 30 messages/hour). Tests: prompt builder includes no financial fields; token parsing; rate limit.

## Phase 4 — Processing pipeline

1. Trial-balance parser `src/lib/parsers/trial-balance.ts`: xlsx/csv (use SheetJS), header detection
   (deterministic first; Claude only as fallback for column mapping, Zod-validated), per-software templates
   (A3, Sage, Contasol, Holded export, Odoo), output `LedgerBalance[]`. Fixture-based tests for each template
   (create realistic synthetic fixtures; I'll replace with real anonymised exports later).
2. Norma 43 parser `src/lib/parsers/norma43.ts` (fixed-width records 11/22/23/33/88), with tests.
3. LLM extractors for Modelo 200, CIRBE, AEAT/TGSS certificates using the Zod schemas in
   `src/lib/schema/canonical.ts` (add certificate schema). Store page references. Retry once, else `needs_review`.
4. Checks engine `src/lib/checks/`: implement the cross-checks listed in CLAUDE.md as pure functions with tests
   (CIRBE vs books debt, N43 inflows vs revenue × 1.21, Modelo 200 vs closed-year TB, certificate validity,
   overdrawn accounts, Holded warnings). When CIRBE exists, pass its 12-month principal into `computeKpis`.
5. Orchestrator: on each upload/sync, recompute statements, KPIs and checks for the case (idempotent). Run inline
   in a route for MVP; keep it behind a function so it can move to a queue.

## Phase 5 — Lender case view (`/casos/[id]`)

Build `design/lender-case-view.html`:
1. Case header: breadcrumb, company, status chip, CIF, request summary, generated-at; actions
   "Pedir documento" (adds a requirement + notifies borrower), "Exportar JSON / Excel", "Exportar paquete PDF".
2. Alerts card: checks ranked high → warn → info, each with "Ver evidencia" opening a side sheet with the
   evidence (values compared, source documents/pages/accounts); passing checks summarised in one green line.
3. KPI cards (EBITDA, DSCR, net financial debt incl. CIRBE variant, liquidity) + table closed FY vs YTD
   (annualised), each value clickable → popover with formula, inputs and note from the engine.
4. Normalised balance sheet, two columns; any line expands to its contributing accounts with source links
   (`lineage` from `buildStatement`). Income statement tab alongside.
5. Right column: documents status, company (KYB/BORME stub data for now), activity from `audit_log`,
   and the no-recommendation disclaimer.
6. Exports: JSON = canonical statements + KPIs + checks + provenance; Excel (SheetJS) with sheets
   Balance, PyG, KPIs, Alertas, Trazabilidad; PDF credit package (2 pages, same design language) via
   `@react-pdf/renderer`. Every export logs to `audit_log`.

## Phase 6 — Hardening

RLS tests (lender A cannot read lender B), magic-link expiry and revocation, file-type sniffing, audit log on every
read of a case by a lender, error states and empty states on every screen, loading skeletons, a basic
Playwright happy path (create case → borrower uploads fixtures → lender sees package).

Start with Phase 1.
