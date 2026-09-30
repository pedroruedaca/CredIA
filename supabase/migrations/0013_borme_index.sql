-- BORME on demand: keep only a light index of Section A (which company appears in which announcement, ~0.45 MB a
-- day) instead of every act (~3 MB a day). A company's acts are read from the BOE PDFs when a lender confirms it
-- (borme_company_acts, cached per registry sheet) and kept up to date by the daily job for confirmed companies.
-- The index keeps BORME_RETENTION_MONTHS (default 24); older days are pruned by the daily job.
--
-- If the project is read-only for exceeding its plan's database size, run this first, in the same query:
--   set session characteristics as transaction read write;

-- Provincial PDFs of each issue: BORME-A-<year>-<issue>-<seq> and its province.
create table borme_pdfs (
  published_on date not null,
  issue smallint not null,
  seq smallint not null,
  province text not null,
  primary key (published_on, seq)
);

-- One row per announcement: where to find it and whose it is. Announcement numbers are unique within an issue.
create table borme_index (
  published_on date not null,
  seq smallint not null,
  entry_number integer not null,
  company_norm text not null,
  registry_sheet text,
  primary key (published_on, entry_number)
);
create index borme_index_company_idx on borme_index (company_norm);
create index borme_index_sheet_idx on borme_index (registry_sheet);

-- Full acts, only for companies a lender has confirmed (shared public data).
create table borme_company_acts (
  published_on date not null,
  borme_id text not null,
  province text not null,
  entry_number integer not null,
  company_name text not null,
  registry_sheet text not null,
  registered_on date,
  act_index smallint not null,
  act_type text not null,
  act_label text not null,
  act_text text not null,
  details jsonb not null default '{}',
  primary key (borme_id, entry_number, act_index)
);
create index borme_company_acts_sheet_idx on borme_company_acts (registry_sheet);

-- Registry sheets whose acts have been read (or are being read) on demand.
create table borme_sheets (
  sheet text primary key,
  status text not null check (status in ('fetching','ready','failed')),
  pdfs integer not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

alter table borme_days drop constraint borme_days_status_check;
alter table borme_days add constraint borme_days_status_check check (status in ('ingested','no_issue','failed','pruned'));

-- Carry over what the full copy already has, within the 24-month retention window.
insert into borme_pdfs (published_on, issue, seq, province)
select distinct on (published_on, split_part(borme_id, '-', 5)::smallint)
  published_on, split_part(borme_id, '-', 4)::smallint, split_part(borme_id, '-', 5)::smallint, province
from borme_acts
where published_on >= current_date - interval '24 months'
order by published_on, split_part(borme_id, '-', 5)::smallint;

insert into borme_index (published_on, seq, entry_number, company_norm, registry_sheet)
select distinct on (published_on, entry_number)
  published_on, split_part(borme_id, '-', 5)::smallint, entry_number, company_norm, registry_sheet
from borme_acts
where published_on >= current_date - interval '24 months'
order by published_on, entry_number, act_index;

insert into borme_company_acts (published_on, borme_id, province, entry_number, company_name, registry_sheet, registered_on,
  act_index, act_type, act_label, act_text, details)
select published_on, borme_id, province, entry_number, company_name, registry_sheet, registered_on,
  act_index, act_type, act_label, act_text, details
from borme_acts
where registry_sheet in (select registry_sheet from case_borme_matches where status = 'confirmed');

insert into borme_sheets (sheet, status)
select distinct registry_sheet, 'ready' from case_borme_matches where status = 'confirmed';

drop table borme_acts;
update borme_days set status = 'pruned' where status = 'ingested' and day < current_date - interval '24 months';

alter table borme_pdfs enable row level security;
alter table borme_index enable row level security;
alter table borme_company_acts enable row level security;
alter table borme_sheets enable row level security;
create policy borme_pdfs_read on borme_pdfs for select to authenticated using (true);
create policy borme_index_read on borme_index for select to authenticated using (true);
create policy borme_company_acts_read on borme_company_acts for select to authenticated using (true);
create policy borme_sheets_read on borme_sheets for select to authenticated using (true);
revoke insert, update, delete on borme_pdfs, borme_index, borme_company_acts, borme_sheets from authenticated, anon;
