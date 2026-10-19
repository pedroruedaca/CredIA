-- Policy parameters («Políticas» → «Parámetros», src/lib/policies/parameters.ts): named values a policy criterion can
-- compare a KPI with (KPI ≥/≤ factor × parameter). A parameter is either fixed (one value for the whole lender, e.g.
-- «DSCR mínimo») or per case (entered for each case, e.g. «Importe solicitado»). Unit and scope never change after
-- creation (policies rely on the unit). Members read; owners and analysts write (is_lender_editor, 0018), as with
-- credit_policies (0029).

create table policy_parameters (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 300),
  unit text not null check (unit in ('EUR', 'x', '%', 'days', 'count')),
  scope text not null check (scope in ('fixed', 'case')),
  value numeric check (value is null or abs(value) < 1e15),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A fixed parameter carries its value; a per-case one gets it from case_parameter_values.
  constraint policy_parameters_value_scope check ((scope = 'fixed') = (value is not null))
);
create unique index policy_parameters_lender_name on policy_parameters (lender_id, lower(btrim(name)));

alter table policy_parameters enable row level security;
create policy policy_parameters_read on policy_parameters for select using (is_lender_member(lender_id));
create policy policy_parameters_insert on policy_parameters for insert with check (is_lender_editor(lender_id));
create policy policy_parameters_update on policy_parameters for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy policy_parameters_delete on policy_parameters for delete using (is_lender_editor(lender_id));

-- A per-case parameter's value for one case.
create table case_parameter_values (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  parameter_id uuid not null references policy_parameters(id) on delete cascade,
  value numeric not null check (abs(value) < 1e15),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (case_id, parameter_id)
);
create index case_parameter_values_parameter on case_parameter_values (parameter_id);

alter table case_parameter_values enable row level security;
create policy case_parameter_values_read on case_parameter_values for select using (is_lender_member(lender_id));
create policy case_parameter_values_insert on case_parameter_values for insert with check (is_lender_editor(lender_id));
create policy case_parameter_values_update on case_parameter_values for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy case_parameter_values_delete on case_parameter_values for delete using (is_lender_editor(lender_id));

create trigger case_parameter_values_lender_check before insert or update on case_parameter_values
  for each row execute function case_child_lender_matches();

-- The value must be for a per-case parameter of the case's own lender.
create or replace function case_parameter_matches() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from policy_parameters where id = new.parameter_id and lender_id = new.lender_id and scope = 'case') then
    raise exception 'parameter is not a per-case parameter of the case''s lender';
  end if;
  return new;
end $$;
create trigger case_parameter_values_parameter_check before insert or update on case_parameter_values
  for each row execute function case_parameter_matches();
