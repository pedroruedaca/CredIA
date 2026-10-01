-- Documents the lender's analyst uploads ("Lo subo yo"), for any kind of document, replacing "Por CIF" (0014), which
-- was limited to the cuentas anuales and the informe de solvencia. case_requirements.source: 'borrower' (the company
-- uploads it through its portal) or 'lender' (the analyst uploads it from the case view; the company's portal does not
-- show it and it does not count towards the company's completeness).
alter table case_requirements drop constraint case_requirements_cif_kinds;
alter table case_requirements drop constraint case_requirements_source_check;
update case_requirements set source = 'lender' where source = 'cif';
alter table case_requirements add constraint case_requirements_source_check check (source in ('borrower','lender'));
