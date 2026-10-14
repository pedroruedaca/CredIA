-- Credit policies («Políticas»): thresholds the lender sets on the KPIs (src/lib/policies/policy.ts). Applied to a
-- case, the case view compares its KPIs with them and says, for information only, whether they fall inside the
-- lender's policy. credIA does not decide: the criteria are the lender's, and nothing here feeds the checks.
-- Members read them; owners and analysts write them (is_lender_editor, 0018), as with case_templates (0019).
--
-- criteria: [{ metric, op: gte|lte, threshold, period: base|closed|ytd }] (validated by the app).

create table credit_policies (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  criteria jsonb not null default '[]' check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) <= 30 and pg_column_size(criteria) < 16384),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credit_policies_lender_idx on credit_policies (lender_id, name);

alter table credit_policies enable row level security;
create policy credit_policies_read on credit_policies for select using (is_lender_member(lender_id));
create policy credit_policies_insert on credit_policies for insert with check (is_lender_editor(lender_id));
create policy credit_policies_update on credit_policies for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy credit_policies_delete on credit_policies for delete using (is_lender_editor(lender_id));

-- The policy applied to a case (null: none; set to null when the policy is deleted). Lender sessions may set it
-- (column grants as in 0024).
alter table cases add column policy_id uuid references credit_policies(id) on delete set null;
grant select (policy_id) on cases to authenticated;
grant update (policy_id) on cases to authenticated;

-- A case can only point at a policy of its own lender.
create or replace function case_policy_lender_matches() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.policy_id is not null and not exists (select 1 from credit_policies where id = new.policy_id and lender_id = new.lender_id) then
    raise exception 'policy does not belong to the case''s lender';
  end if;
  return new;
end $$;
create trigger cases_policy_lender_check before insert or update of policy_id, lender_id on cases
  for each row execute function case_policy_lender_matches();
