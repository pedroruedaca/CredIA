-- Cost of sales as the analyst defines it (src/lib/kpis/cost-of-sales.ts). The accounting gross margin takes cost of
-- sales as aprovisionamientos (60/61) only; the PGC does not separate direct from indirect costs, so the analyst says
-- which lines, PGC groups, subaccounts or model lines are direct for this company. The adjusted gross margin is shown
-- as the analyst's criterion, next to the accounting one.
--
-- selectors: ["line:<expense line>" | "<6xx… account prefix>" | "label:<annual-accounts model line>"] (validated by
-- the app). source: 'analyst' (saved on the case) or 'template' (copied from the case's template at creation).

create table case_cost_definitions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  preset text not null check (preset in ('trading', 'manufacturing', 'services', 'custom')),
  selectors jsonb not null check (jsonb_typeof(selectors) = 'array' and jsonb_array_length(selectors) between 1 and 300 and pg_column_size(selectors) < 32768),
  source text not null default 'analyst' check (source in ('analyst', 'template')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger case_cost_definitions_lender_check before insert or update on case_cost_definitions
  for each row execute function case_child_lender_matches();

alter table case_cost_definitions enable row level security;
create policy case_cost_definitions_read on case_cost_definitions for select using (is_lender_member(lender_id));
create policy case_cost_definitions_insert on case_cost_definitions for insert with check (is_lender_editor(lender_id));
create policy case_cost_definitions_update on case_cost_definitions for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy case_cost_definitions_delete on case_cost_definitions for delete using (is_lender_editor(lender_id));

-- A template's default definition, copied into each case created from it (later template edits never change cases).
alter table case_templates add column cost_of_sales jsonb check (cost_of_sales is null or (jsonb_typeof(cost_of_sales) = 'object' and pg_column_size(cost_of_sales) < 32768));
