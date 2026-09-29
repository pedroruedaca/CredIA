-- Borrower portal: upload metadata, "needs attention" state, gestoría delegate links, submission and consent.

-- Documents: what the borrower uploaded and why it may not satisfy the requirement.
alter table documents
  add column original_name text,
  add column size_bytes bigint check (size_bytes >= 0),
  add column mime_type text,
  add column bank text,                        -- Norma 43: bank chip chosen by the borrower
  add column issued_on date,                   -- certificates: issue date (borrower-entered until extraction runs)
  add column status_message text,              -- borrower-facing fix message when status is 'rejected'/'failed'
  add column uploaded_by text not null default 'borrower' check (uploaded_by in ('borrower','delegate','lender'));

-- 'rejected': received but does not satisfy the requirement (e.g. certificate too old). Borrower must replace it.
alter table documents drop constraint documents_status_check;
alter table documents add constraint documents_status_check
  check (status in ('uploaded','parsing','parsed','needs_review','failed','rejected'));

create index documents_case_kind_idx on documents (case_id, kind, uploaded_at desc);
create unique index documents_case_sha_key on documents (case_id, kind, sha256);

-- Cases: submission and consent withdrawal.
alter table cases
  add column submitted_at timestamptz,
  add column consent_withdrawn_at timestamptz;

revoke select on cases from authenticated, anon;
grant select (id, lender_id, borrower_cif, borrower_name, status, fiscal_year_end, borrower_token_expires_at,
              created_by, created_at, requested_amount, requested_product, requested_term_months,
              borrower_email, updated_at, submitted_at, consent_withdrawn_at) on cases to authenticated;

-- Holded: a stored (refresh-mode) key can be revoked without discarding the data already imported.
alter table holded_connections add column revoked_at timestamptz;

revoke select on holded_connections from authenticated, anon;
grant select (id, case_id, lender_id, token_last4, mode, borrower_consent_at, status,
              last_sync_at, last_error, created_at, revoked_at) on holded_connections to authenticated;

-- Gestoría links: a separate magic-link token scoped to the same case. Only the hash is stored.
create table case_delegates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index case_delegates_case_idx on case_delegates (case_id);

alter table case_delegates enable row level security;
create policy case_delegates_member on case_delegates for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));
create trigger case_delegates_lender_check before insert or update on case_delegates
  for each row execute function case_child_lender_matches();

revoke select on case_delegates from authenticated, anon;
grant select (id, case_id, lender_id, email, expires_at, revoked_at, created_at) on case_delegates to authenticated;

-- Child rows must belong to the same lender as their case.
create trigger documents_lender_check before insert or update on documents
  for each row execute function case_child_lender_matches();
create trigger holded_connections_lender_check before insert or update on holded_connections
  for each row execute function case_child_lender_matches();
