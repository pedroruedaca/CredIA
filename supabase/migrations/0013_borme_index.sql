-- BORME on demand: keep only a light index of Section A (which company appears in which announcement, ~0.45 MB a
-- day) instead of every act (~3 MB a day). A company's acts are read from the BOE PDFs when a lender confirms it
-- (borme_company_acts, cached per registry sheet) and kept up to date by the daily job for confirmed companies.
-- The index keeps BORME_RETENTION_MONTHS (default 24); older days are pruned by the daily job.
--
-- The full copy is dropped first, without carrying data over: on the free plan it had filled the disk and there was
-- no room to copy it. The index is rebuilt by `npm run borme:backfill` (imported days are marked 'failed' so it
-- re-reads them, keeping notified_at), and confirmed companies are re-read on demand ("Reintentar" in the case).
--
-- If the project is read-only for exceeding its plan's database size, make this the first statement:
--   set transaction read write;

drop table borme_acts;

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

-- Days to index again (the backfill re-reads 'failed' days); older than the window: pruned.
update borme_days set status = 'pruned' where status = 'ingested' and day < current_date - interval '24 months';
update borme_days set status = 'failed', error = 'reindex (0013)' where status = 'ingested';

-- Companies already confirmed in a case: their acts must be read again on demand.
insert into borme_sheets (sheet, status, error)
select distinct registry_sheet, 'failed', 'vuelve a consultar el BORME tras el cambio a consulta bajo demanda'
from case_borme_matches where status = 'confirmed';

alter table borme_pdfs enable row level security;
alter table borme_index enable row level security;
alter table borme_company_acts enable row level security;
alter table borme_sheets enable row level security;
create policy borme_pdfs_read on borme_pdfs for select to authenticated using (true);
create policy borme_index_read on borme_index for select to authenticated using (true);
create policy borme_company_acts_read on borme_company_acts for select to authenticated using (true);
create policy borme_sheets_read on borme_sheets for select to authenticated using (true);
revoke insert, update, delete on borme_pdfs, borme_index, borme_company_acts, borme_sheets from authenticated, anon;
