# credIA — starter

Credit data package for Spanish SME lenders: trial balance / Holded → PGC-normalised statements → KPIs → checks.
Read `CLAUDE.md` first (it is also Claude Code's project context).

## Setup
```bash
npm install
cp .env.example .env.local   # fill Supabase + CREDIA_ENCRYPTION_KEY (openssl rand -base64 32)
supabase db push             # applies supabase/migrations/*.sql
npm run typecheck && npm test
npm run dev
```
Create a private Storage bucket `case-files`. In Supabase Auth → URL configuration, add
`<app url>/auth/callback` to the allowed redirect URLs.

First lender: sign in once at `/login` (magic link), then link your user to a new lender:
```bash
npm run seed:lender -- --email you@fondo.es --lender "Fondo Ejemplo Capital"
```

## What's here
| Path | What |
|---|---|
| `supabase/migrations/0001_init.sql` | Schema + RLS by lender, Holded connection/sync tables |
| `supabase/migrations/0002_case_request_and_requirements.sql` | Request details on cases, `case_requirements`, `updated_at` |
| `src/app/casos/` | Lender case list and "Nuevo caso" (magic link generated on create) |
| `src/lib/supabase/` | Server (cookies), browser and service-role clients |
| `src/lib/cif.ts`, `src/lib/magic-link.ts`, `src/lib/cases/` | CIF checksum, borrower tokens, requirements and new-case validation |
| `src/lib/notify.ts` | Email stub (logs the invite in dev only) |
| `src/lib/pgc/mapping.ts` | PGC → canonical balance sheet & P&L, with lineage |
| `src/lib/kpis/engine.ts` | 14 KPIs with formula + inputs |
| `src/lib/schema/canonical.ts` | Zod schemas (statement, Modelo 200, CIRBE extraction) |
| `src/lib/connectors/holded.ts` | Holded v2 client, key verification, closing/opening handling, TB builder |
| `src/lib/connectors/holded-sync.ts` | Closed FY + YTD sync → statements + KPIs |
| `src/lib/crypto/token.ts` | AES-256-GCM sealing for stored keys (refresh mode) |
| `src/app/api/borrower/[token]/holded/route.ts` | Borrower endpoint: verify key → sync → persist |
| `src/components/ConnectHolded.tsx` | Borrower UI (Spanish) |
