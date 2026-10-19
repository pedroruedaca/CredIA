-- Parameters are always per case (Oct 2026): a value the analyst enters on each case. Fixed values belong in the policy
-- itself (a number, or factor × another KPI), so «fixed» parameters go:
--   1. every criterion that used a fixed parameter becomes a plain number, factor × the parameter's value (results do
--      not change);
--   2. fixed parameters are deleted;
--   3. scope and value are dropped from policy_parameters.

-- 1. Criteria on fixed parameters → numbers, keeping the order of the criteria.
update credit_policies cp
set criteria = sub.criteria, updated_at = now()
from (
  select c.id,
         jsonb_agg(
           case
             when p.id is not null then jsonb_build_object(
               'metric', e -> 'metric',
               'op', e -> 'op',
               'period', coalesce(e -> 'period', to_jsonb('base'::text)),
               'threshold', coalesce(nullif(e ->> 'factor', '')::numeric, 1) * p.value)
             else e
           end
           order by x.ord) as criteria
  from credit_policies c
  cross join lateral jsonb_array_elements(c.criteria) with ordinality as x(e, ord)
  left join policy_parameters p on p.id::text = x.e ->> 'parameter_id' and p.lender_id = c.lender_id and p.scope = 'fixed'
  group by c.id
) sub
where sub.id = cp.id
  and exists (
    select 1 from jsonb_array_elements(cp.criteria) e2
    join policy_parameters p2 on p2.id::text = e2 ->> 'parameter_id' and p2.lender_id = cp.lender_id and p2.scope = 'fixed'
  );

-- 2. No more fixed parameters (they never had per-case values).
delete from policy_parameters where scope = 'fixed';

-- 3. A case value only needs the parameter to be its lender's.
create or replace function case_parameter_matches() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from policy_parameters where id = new.parameter_id and lender_id = new.lender_id) then
    raise exception 'parameter does not belong to the case''s lender';
  end if;
  return new;
end $$;

alter table policy_parameters drop constraint policy_parameters_value_scope;
alter table policy_parameters drop column scope;
alter table policy_parameters drop column value;
