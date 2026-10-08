-- Deleting closed cases when the lender's retention period ends, with 14 days' notice (daily cron, service role).
--
-- `purge_warned_for` is the deletion date announced to the lender (Bandeja + email to owners) and `purge_warned_at`
-- when. A case is deleted only on or after the announced date, and only if the announcement belongs to its current
-- closing (`purge_warned_at >= closed_at`): so never without at least 14 days' notice. Rules in
-- src/lib/cases/closing.ts (`purgeStep`), run by src/lib/cases/purge.ts. Written by the service role only; members read.

alter table cases
  add column purge_warned_at timestamptz,
  add column purge_warned_for date;

grant select (purge_warned_at, purge_warned_for) on cases to authenticated;

create index if not exists cases_archived on cases (lender_id) where status = 'archived';
