-- Process templates ("Plantillas"): which documents a case asks for and how its case view looks. Choosing one when
-- creating a case pre-fills the documents (copied into case_requirements: later template edits never change existing
-- cases) and gives the case its dashboard. Members read them; owners and analysts write them (is_lender_editor, 0018).
--
-- requirements: [{ kind, level: required|optional|lender, maxAgeDays }] (validated by the app).
-- layout: the template's own case-view layout (same JSON as dashboard_layouts), or null to use the team's.

create table case_templates (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references lenders(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  product text,
  requirements jsonb not null default '[]' check (jsonb_typeof(requirements) = 'array' and pg_column_size(requirements) < 16384),
  layout jsonb check (layout is null or (jsonb_typeof(layout) = 'object' and pg_column_size(layout) < 16384)),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_templates_lender_idx on case_templates (lender_id, name);

alter table case_templates enable row level security;
create policy case_templates_read on case_templates for select using (is_lender_member(lender_id));
create policy case_templates_insert on case_templates for insert with check (is_lender_editor(lender_id));
create policy case_templates_update on case_templates for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy case_templates_delete on case_templates for delete using (is_lender_editor(lender_id));

-- The template a case was created from (kept for its dashboard; null once the template is deleted), and the case's
-- own layout when someone personalised this case (null: the template's, else the team's).
alter table cases add column template_id uuid references case_templates(id) on delete set null;
alter table cases add column layout jsonb check (layout is null or (jsonb_typeof(layout) = 'object' and pg_column_size(layout) < 16384));
grant select (template_id, layout) on cases to authenticated;

-- A case can only point at a template of its own lender.
create or replace function case_template_lender_matches() returns trigger
language plpgsql as $$
begin
  if new.template_id is not null and not exists (select 1 from case_templates where id = new.template_id and lender_id = new.lender_id) then
    raise exception 'template does not belong to the case''s lender';
  end if;
  return new;
end $$;
create trigger cases_template_lender_check before insert or update of template_id, lender_id on cases
  for each row execute function case_template_lender_matches();
