-- Lender review of a check ("Marcar revisada" / "Pedir aclaración") with an internal note.
-- Keyed by case + check_key rather than checks.id: checks are rebuilt on every processing run, reviews must survive.
-- Append-only history; the latest row per (case_id, check_key) is the current state.
create table check_reviews (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  check_key text not null,
  status text not null check (status in ('open','reviewed','clarification_requested')),
  note text check (char_length(note) <= 2000),
  user_id uuid not null references auth.users(id),
  at timestamptz not null default now()
);
create index check_reviews_case_idx on check_reviews (case_id, check_key, at desc);

create trigger check_reviews_lender_check before insert or update on check_reviews
  for each row execute function case_child_lender_matches();

alter table check_reviews enable row level security;
create policy check_reviews_member on check_reviews for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));
