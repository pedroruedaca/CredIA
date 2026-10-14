-- A template's default credit policy (0029): copied onto each case created from it (cases.policy_id), which the analyst
-- can still change or remove; later template edits never change existing cases. Null: no default.
alter table case_templates add column policy_id uuid references credit_policies(id) on delete set null;

-- A template can only point at a policy of its own lender.
create or replace function template_policy_lender_matches() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.policy_id is not null and not exists (select 1 from credit_policies where id = new.policy_id and lender_id = new.lender_id) then
    raise exception 'policy does not belong to the template''s lender';
  end if;
  return new;
end $$;
create trigger case_templates_policy_lender_check before insert or update of policy_id, lender_id on case_templates
  for each row execute function template_policy_lender_matches();
