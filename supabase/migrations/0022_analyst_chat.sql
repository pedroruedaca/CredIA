-- «Preguntar al caso»: the analyst's chat about one case (src/lib/analyst-chat/), and the conclusions an analyst keeps
-- from it for the package (case view, PDF, Excel and JSON exports).
--
-- Threads are private: one per analyst and case; nobody else in the team reads them. A conclusion is a short text the
-- analyst chose to keep, with the citations (source_refs) of the answer it came from; it belongs to the case and the
-- whole team sees it. Members (viewers too) may ask; only owners and analysts write conclusions.

create table analyst_messages (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 16000),
  -- Citations the answer kept: [{ref, label, href?}] (validated by the app).
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array' and pg_column_size(citations) < 65536),
  -- Which tools ran and which refs they returned (no raw rows), for review and evals.
  tool_trace jsonb not null default '[]' check (jsonb_typeof(tool_trace) = 'array' and pg_column_size(tool_trace) < 65536),
  created_at timestamptz not null default now()
);
create index analyst_messages_thread_idx on analyst_messages (case_id, user_id, created_at desc);

create trigger analyst_messages_lender_check before insert or update on analyst_messages
  for each row execute function case_child_lender_matches();

alter table analyst_messages enable row level security;
create policy analyst_messages_read on analyst_messages for select using (is_lender_member(lender_id) and user_id = auth.uid());
create policy analyst_messages_insert on analyst_messages for insert with check (is_lender_member(lender_id) and user_id = auth.uid());
create policy analyst_messages_delete on analyst_messages for delete using (is_lender_member(lender_id) and user_id = auth.uid());

create table case_conclusions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array' and pg_column_size(citations) < 65536),
  -- The question it answered, for context in the exports.
  question text check (char_length(question) <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index case_conclusions_case_idx on case_conclusions (case_id, created_at);

create trigger case_conclusions_lender_check before insert or update on case_conclusions
  for each row execute function case_child_lender_matches();

alter table case_conclusions enable row level security;
create policy case_conclusions_read on case_conclusions for select using (is_lender_member(lender_id));
create policy case_conclusions_insert on case_conclusions for insert with check (is_lender_editor(lender_id));
create policy case_conclusions_update on case_conclusions for update using (is_lender_editor(lender_id)) with check (is_lender_editor(lender_id));
create policy case_conclusions_delete on case_conclusions for delete using (is_lender_editor(lender_id));
