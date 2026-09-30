-- Financials from the deposited annual accounts, and documents the lender obtains by CIF.
--
-- 1. A closed year can be built from the cuentas anuales (official model) when there is no trial balance or Holded
--    ledger for it: financial_statements.source 'annual_accounts'.
-- 2. case_requirements.source: 'borrower' (the company uploads it, as until now) or 'cif' (the lender obtains it by
--    the company's CIF: today by uploading the PDF from the Registro Mercantil or its provider; later from a
--    provider API). 'cif' only for documents that can be obtained without the company: cuentas anuales and the
--    informe de solvencia. The company's portal does not show 'cif' requirements.

alter table financial_statements drop constraint financial_statements_source_check;
alter table financial_statements add constraint financial_statements_source_check check (source in ('upload','holded','annual_accounts'));

alter table case_requirements add column source text not null default 'borrower' check (source in ('borrower','cif'));
alter table case_requirements add constraint case_requirements_cif_kinds check (source = 'borrower' or doc_kind in ('cuentas_anuales','solvency_report'));
