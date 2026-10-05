-- Function privileges (Supabase security advisor, 0011 and 0028).
--
-- 1. The RLS helpers are SECURITY DEFINER and lived in the API schema callable by anyone, signed in or not
--    (/rest/v1/rpc/is_lender_member…). They only answer true/false for the caller, but anonymous clients have no
--    business calling them. Signed-in users keep EXECUTE: every RLS policy calls them as the querying role.
--    An anonymous query on a member table now fails with "permission denied" instead of returning no rows.
-- 2. touch_case() is a trigger function; triggers fire without EXECUTE, so nobody needs it.
-- 3. The lender-match trigger functions (0008, 0019) get a fixed search_path.
-- 4. Functions created later in public are no longer executable by anon by default (Supabase still grants
--    authenticated and service_role explicitly).

revoke execute on function public.is_lender_member(uuid) from public, anon;
revoke execute on function public.is_lender_owner(uuid) from public, anon;
revoke execute on function public.is_lender_editor(uuid) from public, anon;
grant execute on function public.is_lender_member(uuid) to authenticated, service_role;
grant execute on function public.is_lender_owner(uuid) to authenticated, service_role;
grant execute on function public.is_lender_editor(uuid) to authenticated, service_role;

revoke execute on function public.touch_case() from public, anon, authenticated;

alter function public.case_child_lender_matches() set search_path = public;
alter function public.case_child_lender_matches_nullable() set search_path = public;
alter function public.extraction_lender_matches() set search_path = public;
alter function public.kpi_lender_matches() set search_path = public;
alter function public.holded_sync_lender_matches() set search_path = public;
alter function public.case_template_lender_matches() set search_path = public;

alter default privileges in schema public revoke execute on functions from public, anon;
