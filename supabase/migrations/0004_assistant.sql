-- Documentation assistant (borrower chat) and "Hablar con una persona" requests.

-- One conversation per link holder: the company's own link (delegate_link_id null) or each gestoría link.
create table assistant_messages (
  id bigserial primary key,
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  delegate_link_id uuid references delegate_links(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index assistant_messages_thread_idx on assistant_messages (case_id, delegate_link_id, created_at desc);

create trigger assistant_messages_lender_check before insert or update on assistant_messages
  for each row execute function case_child_lender_matches();

alter table assistant_messages enable row level security;
create policy assistant_messages_member on assistant_messages for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));

-- The borrower asked for a human. The lender follows up by email (notification stubbed in src/lib/notify.ts).
create table support_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  delegate_link_id uuid references delegate_links(id) on delete cascade,
  actor text not null check (actor in ('borrower','delegate')),
  message text check (char_length(message) <= 2000),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create index support_requests_case_idx on support_requests (case_id, created_at desc);

create trigger support_requests_lender_check before insert or update on support_requests
  for each row execute function case_child_lender_matches();

alter table support_requests enable row level security;
create policy support_requests_member on support_requests for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));
