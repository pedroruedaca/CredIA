-- Case request details, borrower contact, and per-case document requirements.

alter table cases
  add column requested_amount numeric(18,2) check (requested_amount > 0),
  add column requested_product text,
  add column requested_term_months int check (requested_term_months between 1 and 360),
  add column borrower_email text,
  add column updated_at timestamptz not null default now();

create unique index cases_borrower_token_hash_key on cases (borrower_token_hash) where borrower_token_hash is not null;
create index cases_lender_updated_idx on cases (lender_id, updated_at desc);

create table case_requirements (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('trial_balance','norma43','modelo200','cuentas_anuales',
                                             'cirbe','aeat_cert','tgss_cert','borme','other')),
  required boolean not null default true,
  max_age_days int check (max_age_days > 0),   -- freshness rule, e.g. TGSS certificate <= 90 days
  created_at timestamptz not null default now(),
  unique (case_id, doc_kind)
);

alter table case_requirements enable row level security;
create policy case_requirements_member on case_requirements for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));

-- A requirement must belong to the same lender as its case.
create or replace function case_child_lender_matches() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from cases where id = new.case_id and lender_id = new.lender_id) then
    raise exception 'lender_id does not match the case';
  end if;
  return new;
end $$;
create trigger case_requirements_lender_check before insert or update on case_requirements
  for each row execute function case_child_lender_matches();

-- cases.updated_at: bumped on edits and whenever the borrower provides something.
create or replace function touch_case() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'cases' then
    new.updated_at := now();
    return new;
  end if;
  update cases set updated_at = now() where id = new.case_id;
  return new;
end $$;
create trigger cases_touch before update on cases
  for each row execute function touch_case();
create trigger documents_touch_case after insert or update on documents
  for each row execute function touch_case();
create trigger holded_connections_touch_case after insert or update on holded_connections
  for each row execute function touch_case();

-- Lenders never read token hashes from the client.
revoke select on cases from authenticated, anon;
grant select (id, lender_id, borrower_cif, borrower_name, status, fiscal_year_end, borrower_token_expires_at,
              created_by, created_at, requested_amount, requested_product, requested_term_months,
              borrower_email, updated_at) on cases to authenticated;
