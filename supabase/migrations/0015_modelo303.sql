-- Modelo 303 (IVA, last 4 quarters): a new document kind, requested with the Modelo 200 as «Documentos fiscales».
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check check (kind in ('trial_balance','norma43','modelo200',
  'modelo303','cuentas_anuales','cirbe','aeat_cert','tgss_cert','solvency_report','borme','other'));

alter table case_requirements drop constraint case_requirements_doc_kind_check;
alter table case_requirements add constraint case_requirements_doc_kind_check check (doc_kind in ('trial_balance',
  'norma43','modelo200','modelo303','cuentas_anuales','cirbe','aeat_cert','tgss_cert','solvency_report','borme','other'));
