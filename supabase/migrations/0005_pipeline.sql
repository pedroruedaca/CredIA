-- Processing pipeline: parsed documents → ledger balances, bank transactions, debt positions → statements,
-- KPIs and checks, recomputed idempotently per case.

-- Checks: passing checks are stored too (the case view summarises them), with where they came from.
alter table checks
  add column status text not null default 'fail' check (status in ('pass','fail','not_applicable')),
  add column source text not null default 'engine' check (source in ('engine','holded')),
  add column document_id uuid references documents(id) on delete cascade;
create index checks_case_idx on checks (case_id, source);

-- One processing run per case at a time; a request during a run schedules one more pass.
alter table cases
  add column processing_lock_until timestamptz,
  add column processing_requested boolean not null default false,
  add column processed_at timestamptz;

grant select (processed_at) on cases to authenticated;

-- Documents: when processing started (to recover runs that died), and which rows each document produced.
alter table documents add column processing_started_at timestamptz;
alter table ledger_balances add column document_id uuid references documents(id) on delete cascade;
alter table bank_transactions add column document_id uuid references documents(id) on delete cascade;
alter table debt_positions add column document_id uuid references documents(id) on delete cascade;
alter table extractions add column status text check (status in ('parsed','failed','needs_review','pending'));

-- Statements record which source they were built from.
alter table financial_statements add column source text check (source in ('upload','holded'));

create index extractions_document_idx on extractions (document_id, created_at desc);
