-- Writes by role, enforced in the database (not only in the app).
--
-- Until now the tables from 0001–0010 had one `for all` policy per table (is_lender_member): any member of a lender,
-- viewers included, could insert, update or delete through the API with their own session, and could delete or rewrite
-- the audit log. The app checked roles, but the database did not. Now:
--
-- 1. Derived and borrower-side tables are read-only for clients. The pipeline, the borrower routes and the lender
--    upload actions write them with the service role, which bypasses RLS.
-- 2. Tables the lender's own session writes: members read; owners and analysts (is_lender_editor) write. Deleting a
--    case is for owners only (is_lender_owner); a deletion removes every row of the case (on delete cascade).
-- 3. audit_log is append-only for clients: members read and add rows as themselves, nobody updates or deletes.
--    The record of a case deletion keeps case_id null (the case's rows are gone) and the case id in `detail`.

-- 1. Read-only for clients.
do $$
declare t text;
begin
  foreach t in array array['documents','extractions','holded_connections','holded_syncs','ledger_balances',
    'bank_transactions','debt_positions','financial_statements','kpis','checks','memos','delegate_links',
    'assistant_messages']
  loop
    execute format('drop policy if exists %I on %I', t || '_member', t);
    execute format('create policy %I on %I for select using (is_lender_member(lender_id))', t || '_read', t);
  end loop;
end $$;

-- 2. Members read, editors write.
do $$
declare t text;
begin
  foreach t in array array['cases','case_requirements','check_reviews','case_borme_matches','support_requests']
  loop
    execute format('drop policy if exists %I on %I', t || '_member', t);
    execute format('create policy %I on %I for select using (is_lender_member(lender_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (is_lender_editor(lender_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id))', t || '_update', t);
    if t = 'cases' then
      execute 'create policy cases_delete on cases for delete using (is_lender_owner(lender_id))';
    else
      execute format('create policy %I on %I for delete using (is_lender_editor(lender_id))', t || '_delete', t);
    end if;
  end loop;
end $$;

-- 3. Append-only audit log.
drop policy if exists audit_log_member on audit_log;
create policy audit_log_read on audit_log for select using (is_lender_member(lender_id));
create policy audit_log_insert on audit_log for insert with check (is_lender_member(lender_id) and actor = auth.uid()::text);
