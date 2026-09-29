-- Every case-scoped row must carry its case's lender_id. RLS already hides other lenders' rows, but without this a
-- member of lender B could insert rows pointing at lender A's case (or A's documents/statements) under B's own
-- lender_id: invisible to A, yet attached to A's data and bumping A's updated_at. Found by tests/integration/rls.test.ts.

-- Tables with a case_id (audit_log.case_id is nullable: rows without a case are checked by RLS alone).
create or replace function case_child_lender_matches_nullable() returns trigger
language plpgsql as $$
begin
  if new.case_id is not null and not exists (select 1 from cases where id = new.case_id and lender_id = new.lender_id) then
    raise exception 'lender_id does not match the case';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['holded_connections','ledger_balances','bank_transactions','debt_positions',
    'financial_statements','checks','memos']
  loop
    execute format('create trigger %I before insert or update on %I for each row execute function case_child_lender_matches()',
                   t || '_lender_check', t);
  end loop;
end $$;

create trigger audit_log_lender_check before insert or update on audit_log
  for each row execute function case_child_lender_matches_nullable();

-- Tables that hang off a parent row instead of a case.
create or replace function extraction_lender_matches() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from documents where id = new.document_id and lender_id = new.lender_id) then
    raise exception 'lender_id does not match the document';
  end if;
  return new;
end $$;
create trigger extractions_lender_check before insert or update on extractions
  for each row execute function extraction_lender_matches();

create or replace function kpi_lender_matches() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from financial_statements where id = new.statement_id and lender_id = new.lender_id) then
    raise exception 'lender_id does not match the statement';
  end if;
  return new;
end $$;
create trigger kpis_lender_check before insert or update on kpis
  for each row execute function kpi_lender_matches();

create or replace function holded_sync_lender_matches() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from holded_connections where id = new.connection_id and lender_id = new.lender_id) then
    raise exception 'lender_id does not match the Holded connection';
  end if;
  return new;
end $$;
create trigger holded_syncs_lender_check before insert or update on holded_syncs
  for each row execute function holded_sync_lender_matches();
