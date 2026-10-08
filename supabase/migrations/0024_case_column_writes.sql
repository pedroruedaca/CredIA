-- Column-level writes on cases, and fixed search paths on the lender-match triggers (security audit, Oct 2026).
--
-- 1. 0023 lets owners and analysts update their lender's cases, but every column was writable through the API with
--    their own session: an analyst could clear `consent_withdrawn_at` (undoing the company's withdrawal of consent,
--    which reopens uploads, Holded syncs and gestoría links), or rewrite pipeline state (`bank_kpis`, `processed_at`,
--    the processing lock) and the case's identity (`borrower_cif`, `created_by`). Those columns are written only by
--    the borrower routes and the pipeline, with the service role. Lender sessions may update only what the app's
--    lender actions write: the request details, status, the borrower link, the template and the case layout.
--    (`updated_at` is set by the touch_case trigger, which column privileges do not affect.)
revoke update on cases from authenticated, anon;
grant update (borrower_name, borrower_email, fiscal_year_end, requested_amount, requested_product, requested_term_months,
              status, submitted_at, borrower_token_hash, borrower_token_expires_at, template_id, layout)
  on cases to authenticated;

-- 2. Trigger functions run with the caller's search_path unless pinned (Supabase linter 0011). Pin them.
alter function case_child_lender_matches() set search_path = public;
alter function case_child_lender_matches_nullable() set search_path = public;
alter function extraction_lender_matches() set search_path = public;
alter function kpi_lender_matches() set search_path = public;
alter function holded_sync_lender_matches() set search_path = public;
alter function case_template_lender_matches() set search_path = public;

-- 3. touch_case is a security-definer trigger function; nobody needs to call it through the API (linter 0028/0029).
--    Triggers fire regardless of EXECUTE privilege.
revoke execute on function touch_case() from public, anon, authenticated;
