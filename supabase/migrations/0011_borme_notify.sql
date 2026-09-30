-- Daily BORME job: which imported days have already been checked for new acts of companies with an open case.
-- Days imported by the backfill (older than the job's window) are never notified.
alter table borme_days add column notified_at timestamptz;
