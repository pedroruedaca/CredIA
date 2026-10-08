-- «Cerrar caso» and the lender's retention period.
--
-- 1. A case ends when the lender closes it (decided, declined, withdrawn) or, if the lender wants, after months with no
--    activity (reason 'inactive', closed by the daily cron). A closed case is `status = 'archived'` with `closed_at`;
--    the company's and the gestoría's links stop working (resolveBorrowerAccess) and stored Holded keys are destroyed.
--    It can be reopened. The two columns always agree (constraint below).
-- 2. Each lender sets how long a closed case is kept (`retention_months`, default 12) and whether open cases close on
--    their own after `auto_close_months` without activity (default 6; null = never). Owners change both in Ajustes.
--    This migration records the period; deleting cases when it ends is a later step.

alter table cases
  add column closed_at timestamptz,
  add column closed_reason text check (closed_reason in ('decided', 'declined', 'withdrawn', 'inactive'));

-- Cases archived before this migration (none are archived by the app) count as closed when they were last touched.
update cases set closed_at = coalesce(updated_at, created_at) where status = 'archived' and closed_at is null;
alter table cases add constraint cases_closed_when_archived check ((status = 'archived') = (closed_at is not null));

grant select (closed_at, closed_reason) on cases to authenticated;
grant update (closed_at, closed_reason) on cases to authenticated;

alter table lenders
  add column retention_months integer not null default 12 check (retention_months between 1 and 120),
  add column auto_close_months integer default 6 check (auto_close_months is null or auto_close_months between 1 and 36);
grant update (retention_months, auto_close_months) on lenders to authenticated;

-- Last activity of each open case whose lender closes inactive cases: the latest audit row written by a person (the
-- lender's team, the company or its gestoría), or the creation date. System rows (processing, BORME watch) don't count.
-- Read by the daily cron with the service role only.
create index if not exists audit_log_case_at on audit_log (case_id, at desc);

create or replace function open_case_activity()
returns table (case_id uuid, lender_id uuid, auto_close_months integer, last_activity timestamptz)
language sql stable set search_path = public as $$
  select c.id, c.lender_id, l.auto_close_months,
         greatest(c.created_at, coalesce(max(a.at), c.created_at))
  from cases c
  join lenders l on l.id = c.lender_id
  left join audit_log a on a.case_id = c.id and a.actor <> 'system'
  where c.status <> 'archived' and l.auto_close_months is not null
  group by c.id, c.lender_id, l.auto_close_months, c.created_at
$$;
revoke execute on function open_case_activity() from public, anon, authenticated;
grant execute on function open_case_activity() to service_role;
