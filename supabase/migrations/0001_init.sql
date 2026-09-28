-- credIA initial schema
create extension if not exists pgcrypto;

-- Tenancy -------------------------------------------------------------
create table lenders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table lender_members (
  lender_id uuid not null references lenders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'analyst' check (role in ('owner','analyst','viewer')),
  primary key (lender_id, user_id)
);

create or replace function is_lender_member(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lender_members where lender_id = l and user_id = auth.uid());
$$;

-- Cases ---------------------------------------------------------------
create table cases (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  borrower_cif text not null check (borrower_cif ~ '^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$'),
  borrower_name text,
  status text not null default 'awaiting_documents'
    check (status in ('awaiting_documents','processing','ready','needs_review','archived')),
  fiscal_year_end date,                      -- closed FY end used for the "closed_fy" period
  borrower_token_hash text,                  -- magic-link token (sha256), never the raw token
  borrower_token_expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  kind text not null check (kind in ('trial_balance','norma43','modelo200','cuentas_anuales',
                                     'cirbe','aeat_cert','tgss_cert','borme','other')),
  storage_path text not null,
  sha256 text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded','parsing','parsed','needs_review','failed')),
  uploaded_at timestamptz not null default now()
);

create table extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  parser text not null,                       -- e.g. 'tb:a3@1', 'llm:modelo200@1'
  output jsonb not null,
  warnings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Holded connection (API key supplied by the borrower) ----------------
create table holded_connections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  token_ciphertext bytea,                     -- AES-256-GCM (app-level key); null after one-time pull
  token_iv bytea,
  token_tag bytea,
  token_last4 text,
  mode text not null default 'one_time' check (mode in ('one_time','refresh')),
  borrower_consent_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','syncing','synced','invalid_key','missing_scope','error','revoked')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table holded_syncs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references holded_connections(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  period_kind text not null check (period_kind in ('closed_fy','ytd')),
  period_start date not null,
  period_end date not null,
  entries_fetched int not null default 0,
  entries_excluded int not null default 0,     -- closing / regularisation lines
  raw_storage_path text,
  warnings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Normalised data -----------------------------------------------------
create table ledger_balances (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  period_kind text not null check (period_kind in ('closed_fy','ytd')),
  period_start date not null,
  period_end date not null,
  account text not null,                      -- original account code
  pgc3 text not null,                         -- 3-digit PGC rollup
  account_name text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  source text not null check (source in ('upload','holded')),
  source_ref text not null
);
create index on ledger_balances (case_id, period_kind, pgc3);

create table bank_transactions (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  iban_masked text,
  booking_date date not null,
  value_date date,
  amount numeric(18,2) not null,              -- + inflow, - outflow
  concept_code text,
  description text,
  category text,                              -- revenue, payroll, tax, debt_service, ...
  counterparty text,
  source_ref text not null
);
create index on bank_transactions (case_id, booking_date);

create table debt_positions (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  as_of date not null,
  entity text,
  product text,
  drawn numeric(18,2),
  limit_amount numeric(18,2),
  overdue numeric(18,2) default 0,
  maturity text,
  source_ref text not null
);

create table financial_statements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  period_kind text not null check (period_kind in ('closed_fy','ytd')),
  period_start date not null,
  period_end date not null,
  statement jsonb not null,                   -- CanonicalStatement (Zod)
  created_at timestamptz not null default now()
);

create table kpis (
  id bigserial primary key,
  statement_id uuid not null references financial_statements(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  key text not null,
  value numeric,
  formula text not null,
  inputs jsonb not null,
  note text
);

create table checks (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  check_key text not null,
  severity text not null check (severity in ('info','warn','high')),
  message text not null,
  evidence jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table memos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  storage_path text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  lender_id uuid references lenders(id) on delete cascade,
  case_id uuid references cases(id) on delete cascade,
  actor text not null,                        -- user id, 'borrower', 'system'
  action text not null,                       -- e.g. 'holded.connected', 'holded.token_deleted'
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

-- RLS: lender members only. Borrower access goes through server routes (service role).
do $$
declare t text;
begin
  foreach t in array array['cases','documents','extractions','holded_connections','holded_syncs',
    'ledger_balances','bank_transactions','debt_positions','financial_statements','kpis',
    'checks','memos','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_lender_member(lender_id)) with check (is_lender_member(lender_id))', t || '_member', t);
  end loop;
end $$;

alter table lenders enable row level security;
create policy lenders_member on lenders for select using (is_lender_member(id));
alter table lender_members enable row level security;
create policy lender_members_self on lender_members for select using (user_id = auth.uid());

-- Encrypted token columns are never readable from the client, even by lender members.
revoke select on holded_connections from authenticated, anon;
grant select (id, case_id, lender_id, token_last4, mode, borrower_consent_at, status,
              last_sync_at, last_error, created_at) on holded_connections to authenticated;
