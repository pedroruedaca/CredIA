-- Modular case view, phase 2: the team's case-view layout (modules, order, width), one per lender.
-- Members read it; owners and analysts change it (viewers cannot). The app normalises it before drawing
-- (src/lib/case-view/modules.ts), so a stored layout can never hide «Para revisar» or name unknown modules.
-- scope 'team' only for now; product templates and personal overrides come later as new scopes.

create or replace function is_lender_editor(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lender_members where lender_id = l and user_id = auth.uid() and role in ('owner', 'analyst'));
$$;

create table dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  scope text not null default 'team' check (scope in ('team')),
  layout jsonb not null check (jsonb_typeof(layout) = 'object' and pg_column_size(layout) < 16384),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (lender_id, scope)
);

alter table dashboard_layouts enable row level security;
create policy dashboard_layouts_read on dashboard_layouts for select using (is_lender_member(lender_id));
create policy dashboard_layouts_insert on dashboard_layouts for insert with check (is_lender_editor(lender_id));
create policy dashboard_layouts_update on dashboard_layouts for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy dashboard_layouts_delete on dashboard_layouts for delete using (is_lender_editor(lender_id));
