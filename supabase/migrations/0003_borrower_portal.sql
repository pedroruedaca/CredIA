-- Borrower portal: upload metadata, submission, consent withdrawal, gestoría delegate links.

-- Documents: what the borrower uploaded and what the checklist needs to explain it back.
alter table documents
  add column original_filename text,
  add column size_bytes bigint check (size_bytes >= 0),
  add column content_type text,
  add column bank text,                        -- Norma 43: bank chosen in the portal (informational)
  add column issued_on date,                   -- certificates: issue date (typed by the borrower; extraction may overwrite)
  add column attention_message text,           -- borrower-facing fix message set by processing
  add column uploaded_by text not null default 'borrower' check (uploaded_by in ('borrower','delegate','lender'));

-- The same file uploaded twice for the same document is stored once.
create unique index documents_case_kind_sha_key on documents (case_id, kind, sha256);
create unique index documents_storage_path_key on documents (storage_path);
create index documents_case_idx on documents (case_id, uploaded_at desc);

create trigger documents_lender_check before insert or update on documents
  for each row execute function case_child_lender_matches();

-- Cases: submission and consent withdrawal by the borrower.
alter table cases
  add column submitted_at timestamptz,
  add column consent_withdrawn_at timestamptz;

grant select (submitted_at, consent_withdrawn_at) on cases to authenticated;

-- Lender co-branding on the borrower portal (initials badge colour).
alter table lenders add column brand_color text check (brand_color ~ '^#[0-9A-Fa-f]{6}$');

-- Holded: a stored (refresh-mode) key can be revoked; data already imported stays with the case.
alter table holded_connections add column revoked_at timestamptz;
grant select (revoked_at) on holded_connections to authenticated;

-- Gestoría delegate links: a second magic link scoped to the same case. Only the hash is stored.
create table delegate_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  lender_id uuid not null references lenders(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index delegate_links_case_idx on delegate_links (case_id);

create trigger delegate_links_lender_check before insert or update on delegate_links
  for each row execute function case_child_lender_matches();

alter table delegate_links enable row level security;
create policy delegate_links_member on delegate_links for all
  using (is_lender_member(lender_id)) with check (is_lender_member(lender_id));

revoke select on delegate_links from authenticated, anon;
grant select (id, case_id, lender_id, email, expires_at, revoked_at, created_at) on delegate_links to authenticated;
