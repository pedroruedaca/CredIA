-- BORME (Registro Mercantil gazette), Section A "actos inscritos": a shared copy imported daily from the BOE open
-- data API, plus the lender's confirmation of which registry sheet is the case's company.

-- Public gazette data, one row per act. Not case-scoped: shared by every lender, written only by the importer
-- (service role), readable by any signed-in user.
create table borme_acts (
  id bigserial primary key,
  published_on date not null,
  borme_id text not null,              -- provincial PDF, e.g. BORME-A-2026-185-46
  province text not null,
  pdf_url text not null,
  entry_number integer not null,
  company_name text not null,
  company_norm text not null,          -- companyKey(): no accents, punctuation or legal form
  registry_sheet text,                 -- "V-123456": identifies the company across renames
  registered_on date,
  act_index smallint not null,
  act_type text not null,
  act_label text not null,
  act_text text not null,
  details jsonb not null default '{}',
  unique (borme_id, entry_number, act_index)
);
create index borme_acts_company_idx on borme_acts (company_norm);
create index borme_acts_sheet_idx on borme_acts (registry_sheet);

-- One row per BORME day the importer has looked at.
create table borme_days (
  day date primary key,
  status text not null check (status in ('ingested','no_issue','failed')),
  pdfs integer not null default 0,
  entries integer not null default 0,
  acts integer not null default 0,
  warnings integer not null default 0,
  error text,
  fetched_at timestamptz not null default now()
);

alter table borme_acts enable row level security;
alter table borme_days enable row level security;
create policy borme_acts_read on borme_acts for select to authenticated using (true);
create policy borme_days_read on borme_days for select to authenticated using (true);
revoke insert, update, delete on borme_acts, borme_days from authenticated, anon;

-- Which registry sheet is the case's company, as confirmed by the lender ('none': none of the candidates is it).
-- One current row per case; changes are audit-logged.
create table case_borme_matches (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  status text not null check (status in ('confirmed','none')),
  registry_sheet text check ((status = 'confirmed') = (registry_sheet is not null)),
  company_name text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

create trigger case_borme_matches_lender_check before insert or update on case_borme_matches
  for each row execute function case_child_lender_matches();

alter table case_borme_matches enable row level security;
create policy case_borme_matches_member on case_borme_matches for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));
