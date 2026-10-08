-- Security audit follow-ups (Oct 2026).
--
-- 1. Support requests are the company's own words. 0023 let owners and analysts insert, update (every column, the
--    message included) and delete them; the app only ever marks them attended («Marcar atendida»). Lender sessions may
--    now update the status and nothing else. Rows are created by the borrower route with the service role.
revoke insert, update, delete on support_requests from authenticated, anon;
grant update (status) on support_requests to authenticated;
drop policy if exists support_requests_insert on support_requests;
drop policy if exists support_requests_delete on support_requests;

-- 2. Rate limits for the company's links (uploads, Holded connections, gestoría invitations): one fixed-window counter
--    per key (route, case, link holder). Service role only: RLS on, no policies, no grants. The key carries the case id
--    as text, not as a foreign key; rows older than two days are pruned by the daily cron.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

-- Counts one hit for `p_key` and says whether it is within `p_max` hits per `p_window_seconds`.
create or replace function hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into n;
  return n <= p_max;
end $$;
revoke execute on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, integer, integer) to service_role;
