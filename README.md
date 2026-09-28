# credIA — starter

Credit data package for Spanish SME lenders: trial balance / Holded → PGC-normalised statements → KPIs → checks.
Read `CLAUDE.md` first (it is also Claude Code's project context).

## Setup
```bash
npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*"   # say "no" to overwriting existing files
npm install
cp .env.example .env.local   # fill Supabase + CREDIA_ENCRYPTION_KEY (openssl rand -base64 32)
supabase db push             # applies supabase/migrations/0001_init.sql
npm test
```
Create a private Storage bucket `case-files`.

## What's here
| Path | What |
|---|---|
| `supabase/migrations/0001_init.sql` | Schema + RLS by lender, Holded connection/sync tables |
| `src/lib/pgc/mapping.ts` | PGC → canonical balance sheet & P&L, with lineage |
| `src/lib/kpis/engine.ts` | 14 KPIs with formula + inputs |
| `src/lib/schema/canonical.ts` | Zod schemas (statement, Modelo 200, CIRBE extraction) |
| `src/lib/connectors/holded.ts` | Holded v2 client, key verification, closing/opening handling, TB builder |
| `src/lib/connectors/holded-sync.ts` | Closed FY + YTD sync → statements + KPIs |
| `src/lib/crypto/token.ts` | AES-256-GCM sealing for stored keys (refresh mode) |
| `src/app/api/borrower/[token]/holded/route.ts` | Borrower endpoint: verify key → sync → persist |
| `src/components/ConnectHolded.tsx` | Borrower UI (Spanish) |
