-- Small, borrower-safe summary of what was read from a document (e.g. the period a trial balance or bank file
-- covers), so the portal can show it without loading the full extraction output.
alter table extractions add column summary jsonb not null default '{}';
