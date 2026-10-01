-- Statements from tax returns when there is no trial balance, Holded ledger or cuentas anuales for a period:
-- 'modelo200' (closed year, full balance sheet and P&L from the return) and 'modelo303' (closed year or year to
-- date, revenue only: sales declared in the IVA returns; statement.scope = 'revenue').
alter table financial_statements drop constraint financial_statements_source_check;
alter table financial_statements add constraint financial_statements_source_check check (source in ('upload','holded','annual_accounts','modelo200','modelo303'));
