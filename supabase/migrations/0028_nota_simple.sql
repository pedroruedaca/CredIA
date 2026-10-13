-- Nota simple informativa del Registro Mercantil: a new document kind (KYB phase 2a: current board, registered office,
-- capital, sole shareholder, situation). Widening the checks only, so the code before it keeps working.
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check check (kind in ('trial_balance','norma43','modelo200',
  'modelo303','cuentas_anuales','cirbe','aeat_cert','tgss_cert','solvency_report','nota_simple','borme','other'));

alter table case_requirements drop constraint case_requirements_doc_kind_check;
alter table case_requirements add constraint case_requirements_doc_kind_check check (doc_kind in ('trial_balance',
  'norma43','modelo200','modelo303','cuentas_anuales','cirbe','aeat_cert','tgss_cert','solvency_report','nota_simple',
  'borme','other'));
