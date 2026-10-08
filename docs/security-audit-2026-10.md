# credIA — security and GDPR audit (8 Oct 2026)

Scope: the whole repository at `8a8a546` (Next.js app, `src/lib`, 23 migrations), plus a read-only look at the live
Supabase project's metadata (security advisors, the storage bucket, column privileges). No case data was read.

## Summary

There are **no critical findings.** The parts that are usually weak in generated code are solid here: tenant isolation is
enforced by RLS (and integration-tested table by table), the service-role client stays in server-only modules behind
explicit authorisation, borrower tokens are 256-bit, stored only as hashes, and expire. Holded keys are sealed with
AES-256-GCM using the row id as AAD. Uploads go through signed URLs and are re-checked by path regex and magic bytes. The
cron route checks its secret in constant time. Logs never contain tokens, questions or answers.

This branch fixes four issues (§1). What remains is mostly GDPR posture (legal basis, retention, transfers) and
hardening work (§2–§3).

| # | Finding | Severity | Status |
|---|---|---|---|
| 1.1 | Analysts can undo a company's consent withdrawal and rewrite pipeline state on `cases` | Medium | **Fixed** (0024) |
| 1.2 | Open redirect after login (`next=/%09/evil.example`) | Low–Medium | **Fixed** |
| 1.3 | Anyone can create an auth account through the login form (open sign-up) | Low | **Partly fixed**: dashboard change needed |
| 1.4 | Trigger functions with a mutable `search_path`; `touch_case` callable over RPC | Low | **Fixed** (0024) |
| 2.1 | Legal basis "consent" does not cover the people in the documents; withdrawal doesn't stop processing | Medium (GDPR) | Open |
| 2.2 | No retention period is enforced, and the notice still says `[PLAZO DE CONSERVACIÓN]` | Medium (GDPR) | In progress: closing and the period (0025); purge pending |
| 2.3 | Transfers to Anthropic (US): whole bank statements, including employees' names and salaries | Medium (GDPR) | Open |
| 2.4 | Processor paperwork: Art. 28 contract with lenders, RoPA, DPIA, notice placeholders | Medium (GDPR) | Open |
| 3.1 | No Content-Security-Policy, and the Supabase session cookie is readable by JS | Medium | Open |
| 3.2 | Borrower endpoints have no rate or volume limits (uploads trigger paid LLM extraction) | Medium | Open |
| 3.3 | Magic-link token in the URL path: ends up in access logs and browser history for 30 days | Low | Open |
| 3.4 | `appBaseUrl()` falls back to the request `Host` when `NEXT_PUBLIC_APP_URL` is unset | Low | Open |
| 3.5 | Team invite reveals whether an email address belongs to another lender | Low | Open |
| 3.6 | Editors can rewrite borrower-authored rows (`support_requests.message`) | Low | Open |
| 3.7 | Prompt injection from borrower documents into extraction and the analyst chat | Low | Mitigated, monitor |
| 3.8 | Minor hardening (Holded body not Zod-validated, GCM tag length, `is_lender_*` callable by anon) | Info | Open |

---

## 1. Fixed in this branch

### 1.1 Analysts can undo consent withdrawal (Medium) — fixed by `0024_case_column_writes.sql`
0023 gives owners and analysts `UPDATE` on their lender's `cases`, but at table level. The live database confirms that
`authenticated` holds `UPDATE` on every column (`has_column_privilege('authenticated','cases','consent_withdrawn_at','UPDATE') = true`).
Using their own session against PostgREST (`/rest/v1/cases?id=eq.…`), an analyst could:

- set `consent_withdrawn_at = null`. That reopens uploads, Holded syncs and the borrower portal after the company
  withdrew consent («Retirar consentimiento»). This is a GDPR Art. 7(3) problem and leaves no audit trail.
- rewrite `bank_kpis`, `processed_at`, `processing_lock_until`, `borrower_cif` and `created_by`, which breaks the
  provenance rule ("no number without `source_ref`").

**Fix:** revoke table-level `UPDATE` and grant it only on the columns the lender's server actions write: request
details, `status`, `submitted_at`, the link hash and expiry, `template_id` and `layout`. Covered by a new case in
`tests/integration/role-writes.test.ts`. That test **has not been run yet**: there was no Docker daemon in the audit
sandbox. Run `npm run test:integration` before merging.

### 1.2 Open redirect after login (Low–Medium) — fixed in `src/lib/safe-redirect.ts`
`safeNextPath` rejected `//x` and `/\x`, but not `/\t/evil.example`. WHATWG URL parsing strips tabs and newlines, so
`new URL("/\t/evil.example", origin)` resolves to `https://evil.example/` (checked with Node). An attacker could send
`/login?next=/%09/evil.example`. After a genuine magic-link sign-in, the victim would land on the attacker's page (for
example a fake "session expired" form). The function now refuses control characters and backslashes, and checks that
the path resolves to the same origin. Tests added.

### 1.3 Open sign-up (Low) — partly fixed
`signInWithOtp` defaults to `shouldCreateUser: true`, so any email typed into `/login` created an `auth.users` row.
That is personal data about people who are not customers, and anyone could hold an authenticated session. Such a
session can read the BORME tables (`to authenticated using (true)`) but no tenant data. The login form now passes
`shouldCreateUser: false`; members are created by `findOrCreateUser` from Ajustes.
**Still required:** this is a client-side option, so anyone can call `/auth/v1/otp` directly with the anon key. Turn off
*Authentication → Sign In / Providers → Allow new users to sign up* in the Supabase dashboard. The admin API keeps
working for invites. Also delete any `auth.users` rows with no `lender_members` row (the live project has none today).

### 1.4 Function hardening (Low) — fixed by 0024
The Supabase linter flags six lender-match trigger functions with a mutable `search_path`, and the security-definer
`touch_case()` as executable by `anon` and `authenticated`. 0024 pins `search_path = public` on the six functions and
revokes `EXECUTE` on `touch_case`. Triggers keep firing regardless of that grant.

---

## 2. GDPR (open)

credIA's subjects are legal entities, but the documents contain plenty of natural persons:

- administrators and shareholders (BORME, cuentas anuales, solvency reports)
- employees: payroll lines in Norma 43 and bank PDFs give names and net salaries
- individual customers and suppliers named in bank movements
- gestoría staff (delegate emails)
- the borrower's own contact person

### 2.1 Legal basis and withdrawal (Medium)
The privacy notice (`src/content/data-protection.es.ts`) names "tu consentimiento" plus pre-contractual measures. Two
problems:

1. The company cannot consent on behalf of its employees or counterparties (Art. 7). Art. 6(1)(b) covers only the
   data subject's own contract.
2. Under a consent basis, withdrawal must stop processing. Today withdrawal stops *new* sharing only. The case stays
   readable, stuck runs are reprocessed, and the analyst chat keeps sending case data to Anthropic.

**Recommendation:** rely on the lender's legitimate interest (Art. 6(1)(f)), documented in a short LIA, for third
parties in the documents. Keep «Retirar consentimiento» as stop-sharing plus an objection channel. After a withdrawal,
block reprocessing and the analyst chat on that case, and show the lender a «solicitar supresión» prompt. Get a data
protection adviser to confirm before the pilot.

### 2.2 Storage limitation (Medium)
Nothing deletes cases automatically, and the notice still reads `[PLAZO DE CONSERVACIÓN]`. Art. 5(1)(e) needs a
defined period that is actually enforced. **Recommendation:**
- a per-lender retention setting (for example 12 months after the case was last updated or archived)
- a daily-cron purge that reuses `deleteCase`'s file-then-row logic, with an audit row
- the same rule for `assistant_messages`, `analyst_messages`, magic-link audit rows, and BORME data beyond what is needed

### 2.3 International transfers and minimisation (Medium)
PDF extraction (including whole bank statements) and the analyst chat send content to Anthropic in the US. The notice
cites SCCs. Before the pilot:
- confirm the DPA, the transfer mechanism (EU–US DPF certification and/or SCCs) and a transfer impact assessment
- ask for zero data retention on the API organisation
- prefer the deterministic N43/Excel paths over PDFs, which keeps payroll and personal-counterparty lines out of the
  model where possible
- list Resend (email) and Vercel and Supabase support access as subprocessors with their regions

### 2.4 Processor obligations (Medium)
credIA is a processor (Art. 28). The following are needed before onboarding the first lender:
- a signed DPA with each lender: instructions, subprocessors, notice of new subprocessors, assistance with rights,
  deletion and return at end of contract (the «Descargar todo» export and deletion already support this)
- a Record of Processing Activities (Art. 30(2))
- a breach procedure (Art. 33: notify the controller without undue delay)
- a DPIA screening: financial data and systematic evaluation for credit are likely to need one on the lender's side,
  and credIA should supply its part

Fill the bracketed placeholders in the notice (legal identity, privacy email, retention).

---

## 3. Application security (open)

### 3.1 No CSP; session cookie readable by JS (Medium)
`@supabase/ssr` keeps the session in cookies that JavaScript can read. Any XSS therefore means account takeover, with
access to every case of the lender. React escaping is used throughout: there is no `dangerouslySetInnerHTML`, and
citation links are restricted to `https?://` or app paths. So nothing exploitable was found, but there is no second line
of defence. **Recommendation:** add a nonce-based CSP in `middleware.ts` (`script-src 'nonce-…' 'strict-dynamic'`,
`object-src 'none'`, `base-uri 'none'`, `connect-src` to self, Supabase and the Storage host). Start in report-only
mode.

### 3.2 No limits on borrower endpoints (Medium, cost and availability)
Anyone holding a link (the company, or up to 5 gestoría delegates) can upload an unlimited number of 20 MB files. Each
one triggers `processCase`, which includes paid Claude extraction for PDFs. Only the assistant is rate-limited (30 per
hour). **Recommendation:**
- a per-case document cap (for example 200) and a byte budget
- a per-token request limit on `uploads`, `documents`, `holded` and `delegate`
- a daily cap on LLM extractions per case, with alerts on Anthropic spend

### 3.3 Token in the URL path (Low)
`/s/<token>` and `/api/borrower/<token>/…` place a 30-day bearer credential in Vercel request logs, browser history and
any proxy logs. `no-referrer` and `no-store` are already set, which is good. **Recommendation:** on first visit,
exchange the token for an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/s` and `/api/borrower`, then redirect to
a token-less URL. Also keep log retention short.

### 3.4 Host-header fallback for emailed links (Low)
`appBaseUrl()` uses `x-forwarded-host`/`host` when `NEXT_PUBLIC_APP_URL` is unset. Vercel only routes assigned domains,
so the risk is low, but a misconfigured preview or another host could email magic links pointing elsewhere. Make
`NEXT_PUBLIC_APP_URL` mandatory in production: throw if it is unset and `VERCEL_ENV === "production"`.

### 3.5 Cross-tenant email enumeration (Low)
`inviteMember` answers "ya pertenece a otra entidad en credIA", which tells one lender's owner that an address is a
customer of another lender. Return a neutral message and handle the conflict out of band.

### 3.6 Editors can edit borrower-authored rows (Low)
`support_requests` (0023, group 2) is writable by owners and analysts, including `message`, the company's own words.
Grant `UPDATE (status)` only, as done for `cases` in 0024.

### 3.7 Prompt injection through documents (Low, mitigated)
A borrower controls PDF and bank-movement text that reaches Claude (extraction and the analyst chat's bank-search
tool). Mitigations already in place:
- Zod validation of every extraction
- read-only chat tools that read through the analyst's own RLS client
- figures only from tool refs (`validateAnswer`)
- the cross-checks against independent sources

Keep it that way: never give the chat a tool with side effects. Treat a PDF-only financial statement as weaker
evidence in the UI, as the ranking already does.

### 3.8 Minor
- `POST /api/borrower/[token]/holded` casts the body instead of Zod-validating it. A non-string `apiKey` gives a 500.
  Use `z.object({ apiKey: z.string().min(10).max(200), consent: z.literal(true), mode: z.enum([...]).optional() })`.
- `crypto/token.ts open()`: pass `{ authTagLength: 16 }` to `createDecipheriv` and check `tag.length === 16`, so a
  truncated tag is never accepted.
- `is_lender_member/editor/owner` can be called by `anon` over RPC. They only return `false` for anon, so this is
  harmless, but the linter will keep flagging it. Revoking anon would make anon table reads error instead of returning
  empty, so leave it unless that is wanted.
- "Leaked password protection" advisor: irrelevant while only magic links are used. Disable the email+password provider
  if it is not needed.

---

## What was checked and found sound
- **Authorisation:** every lender page, server action and route calls `requireLender`/`getLenderContext` and reads the
  case through the RLS client before any service-role call. Viewer, analyst and owner roles are checked in code and,
  since 0023, in the database. Owner-only paths: deletion, «Descargar todo», team management.
- **Service role:** imported only from `server-only` modules, and used after an RLS read has proven access. Storage paths
  are always rebuilt or validated (`parseUploadPath`), never taken from the client.
- **Borrower access:** hashed 256-bit tokens with a shape check before any lookup. Expiry, revocation and archival are
  enforced. Delegate links never outlive the company's link and cannot delegate further.
- **Storage:** `case-files` is private and has no storage RLS policies (clients have no direct access). Signed URLs last
  60 s.
- **Uploads:** extension allow-list, magic bytes, a 20 MB cap, SHA-256 dedupe, filenames cleaned and never used in paths.
- **Exports:** filenames are sanitised (no header injection), exports are audit-logged, and zips are temporary and swept.
- **Email:** user-supplied values are HTML-escaped in templates, and subjects are kept on one line.
- **Headers:** `X-Frame-Options`, `frame-ancestors`, HSTS, nosniff and `Permissions-Policy` are set. Lender pages are
  `no-store` and noindex.
- **Secrets:** cron compared in constant time; AES-256-GCM with AAD for Holded keys; no tokens, keys or questions in logs.
- **Data residency:** Vercel in `dub1` and Supabase in `eu-west-1`.
- **Data subject rights:** «Descargar todo» supports access and portability, and case deletion supports erasure.
