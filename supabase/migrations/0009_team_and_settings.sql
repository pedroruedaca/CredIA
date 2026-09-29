-- Ajustes: members see their teammates; owners edit their lender's name and brand colour.
-- Team changes (invite, role, remove) are server actions that check the owner role and use the service role,
-- so lender_members stays read-only for clients.

create or replace function is_lender_owner(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lender_members where lender_id = l and user_id = auth.uid() and role = 'owner');
$$;

-- Teammates, not only yourself (the existing lender_members_self policy stays).
create policy lender_members_team on lender_members for select using (is_lender_member(lender_id));

-- Only name and brand_color are client-writable, and only by owners.
revoke update on lenders from authenticated, anon;
grant update (name, brand_color) on lenders to authenticated;
create policy lenders_owner_update on lenders for update using (is_lender_owner(id)) with check (is_lender_owner(id));
alter table lenders add constraint lenders_name_length check (char_length(btrim(name)) between 2 and 120) not valid;

-- The inbox reads open help requests and needs-review documents by lender.
create index if not exists support_requests_lender_idx on support_requests (lender_id, status, created_at desc);
create index if not exists documents_lender_status_idx on documents (lender_id, status);
