# Profile-not-found fix report

Date: 2026-11-26  
Scope: focused repair of the post-signup/sign-in error “Profile not found. Please contact support.” No auth rewrite, account recreation, database reset or production write was performed by the agent.

## 1. Root cause

The error was not caused by a wrong profile column or a bad Supabase session. It was caused by the hosted database being only partially migrated.

### Evidence from the hosted project (`gzpjxyvhozlwwkqrxhok`, read-only)

| Check | Result |
|---|---|
| `supabase migration list --remote` | All nine local migration slots blank remotely |
| `supabase_migrations.schema_migrations` | Does not exist (`42P01`) |
| `auth.users` | 3 rows |
| `public.profiles` | 0 rows |
| Auth users without a profile | 3 |
| `on_auth_user_created` trigger on `auth.users` | Missing |
| Public functions (`public.*`) | 0 |
| Policies on `public.profiles` | 0 |
| `has_table_privilege('authenticated','public.profiles','SELECT')` | `false` |
| `scrap_listings` | Missing |

The affected hosted accounts are:

- `virat@gmail.com` — `61dc9d6b-1156-4874-816a-52c2e38c7278`
- `sakshamvarshney@outlook.com` — `47c2c90d-8445-4b98-951f-37f8a182f46f`
- `sakshamvarshney57531@outlook.com` — `6f1e6707-11f5-4bdd-b753-680a862bb02e`

Migration 001 had been applied manually to the hosted project, but the migration history was never recorded and migrations 002–009 were never applied. The `handle_new_user()` trigger is defined in migration 004, so hosted signups created `auth.users` rows without a matching `profiles` row. Sign-in still succeeded because GoTrue is independent of the public schema; the dashboard/profile read then found no row.

Additionally, `authenticated` lacked `SELECT` on `public.profiles` and there were no RLS policies. Even a manually inserted profile would have been unreadable through PostgREST (42501/permission failure), which the old generic error handling could misreport as “Profile not found.”

### Frontend lookup verified

The schema uses `profiles.id` as the primary key and foreign key to `auth.users.id`. The code correctly queries `.eq('id', userId)`. No column mismatch was found.

Local stack, for comparison: all nine migrations applied, 34 auth users, 34 profiles, 0 users without a profile, trigger and policies present, and `authenticated` had `SELECT` on `profiles`.

## 2. Repair in place

### Database: additive, idempotent migration

`supabase/migrations/20261126000100_profile_bootstrap_and_recovery.sql` now provides:

1. Grants/usage for `authenticated` on existing RLS-enabled public tables. RLS remains the security boundary; no policy is weakened and `anon` receives no new access.
2. Re-assertion of `public.handle_new_user()` and the `on_auth_user_created` trigger so future signups always get a profile.
3. A backfill that inserts one `consumer` profile for each existing auth user that has none:
   - `WHERE NOT EXISTS` plus `ON CONFLICT (id) DO NOTHING`
   - existing profile rows and their roles are never modified
   - no duplicate profile can be created
4. `public.ensure_own_profile()`:
   - `SECURITY DEFINER`, no arguments
   - uses only `auth.uid()`
   - always assigns the default `consumer` role
   - idempotent; cannot create, read or modify another user’s profile
   - executable only by `authenticated`

### Frontend: accurate error states and self-healing lookup

`src/lib/profileApi.js` and `src/lib/listingsApi.js` share one lookup path used by dashboards and `ProfilePage`:

- A genuinely missing row triggers one `ensure_own_profile()` repair and then re-reads.
- `42501`/401/403 is reported as a permission problem, not a missing profile.
- Network and server failures keep their own messages.
- A function-not-deployed error (`PGRST202`) reports that migrations are pending.
- The literal “Profile not found” message is reserved for the case where a legitimate repair returned no row.

The preserved auth repair (`AuthProvider`, `useAuth`, `ProtectedRoute`, signup/signin validation, no email verification) was not changed.

### Focused UI correction

`src/components/ProfilePage.jsx` previously entered an error state but still rendered empty profile details and an “Edit profile” action that could not save anything. It now shows an explicit alert with **Try again** and **Go to sign in**, and hides the edit form until a profile has actually loaded. This matches the dashboard’s recovery pattern and keeps the signed-in user in the app rather than forcing a new sign-in for a transient failure.

### Regression tests

- `tests/profile.test.js` — unit coverage for classification/repair behavior.
- `tests/profile.spec.js` — browser coverage for:
  - an account with no profile row healing and reaching the dashboard
  - transient profile failure retry without signing out
  - refused read reported as access problem, with no repair call
  - profile page failure/retry without losing the session (added in this pass)
- `tests/integration/profile.integration.test.js` — real local PostgREST/Storage tests for signup trigger, repair, idempotency, unauthenticated refusal, cross-user read denial and role/admin escalation denial.

Stale Phase 6 browser assertions were corrected (case-sensitive `Sign In` selector, ambiguous text matches, and a public-page assertion that treated the privacy note containing “payment amounts” as a leaked payment row). These were test-only fixes; no product behavior changed.

## 3. Existing hosted account repair — applied

After explicit approval, the pending migrations were pushed to hosted project `gzpjxyvhozlwwkqrxhok`. No account was recreated, no database was reset, no profile was deleted and no role was elevated.

### What happened during the push

1. A dry run confirmed migrations 001–009 were pending.
2. The first push applied 001 and 002, then stopped at 003 with `uuid_generate_v4() does not exist`. On this hosted project the `uuid-ossp` extension lives in the `extensions` schema, while migrations 003+ call the unqualified function on the `"$user", public` search path.
3. Rather than edit applied migrations, a forward-only compatibility migration was added: `supabase/migrations/20261124000250_compat_public_uuid_generate_v4.sql`. It creates a `public.uuid_generate_v4()` shim backed by PostgreSQL’s built-in `gen_random_uuid()` only when no public function exists. It is a no-op where the extension already installed the function in `public`.
4. The compatibility migration was applied locally first, then the hosted push resumed and applied 00250 plus 003–009 successfully.

`supabase migration list --remote` now shows all ten local migration versions (001, 002, 00250, 003–008 and the bootstrap migration) recorded remotely.

### Hosted verification (read-only)

| Check | Result |
|---|---|
| `auth.users` | 3 |
| `public.profiles` | 3 |
| Distinct profile IDs | 3 |
| Auth users without a profile | 0 |
| `on_auth_user_created` trigger | 1 |
| `public.ensure_own_profile()` | 1 |
| `authenticated` has `SELECT` on `profiles` | yes |
| Policies on `profiles` | 4 |
| `scrap_listings` | present |

A final `supabase db push --remote --dry-run --yes` reports `Remote database is up to date.`

All three existing accounts now have exactly one profile with `active_role = 'consumer'`:

- `virat@gmail.com` / `61dc9d6b-1156-4874-816a-52c2e38c7278` — profile present
- `sakshamvarshney@outlook.com` / `47c2c90d-8445-4b98-951f-37f8a182f46f` — profile present
- `sakshamvarshney57531@outlook.com` / `6f1e6707-11f5-4bdd-b753-680a862bb02e` — profile present

The profile columns and grants required by the dashboard are now in place on production. The final UI confirmation still needs the account owner to sign in to the existing account; no password or personal session was used by the agent.

## 4. Migration safety validation

A throwaway local database was created inside the local Supabase Postgres container with only the Supabase-shaped schemas the migrations depend on (`auth.users`, `auth.uid()`, `storage.buckets/objects`) — equivalent to the hosted project’s partial state. All nine original migrations were applied in filename order, then the bootstrap migration was applied a second time. After the hosted extension-schema difference was discovered, the new compatibility migration was also applied to the main local stack with `supabase migration up --local --include-all` before it was pushed remotely.

Results:

- All nine original migrations applied without errors in the throwaway simulation.
- Bootstrap reapplication succeeded (idempotent).
- The compatibility migration applied locally without errors and is a no-op where `uuid-ossp` is already in `public`.
- `auth_trigger = 1`
- `ensure_function = 1`
- `authenticated_select_profiles = 1`
- Inserting a test auth user auto-created a `consumer` profile via the trigger.
- Deleting that profile and calling `ensure_own_profile()` as `authenticated` recreated it with the caller’s own UUID.
- Calling it again returned the same row (idempotent).

The throwaway database was dropped afterwards. The main local database was not reset or modified by this validation.

## 5. Actual test results

| Check | Result |
|---|---|
| `npm run lint` | Passed, no findings |
| `npm test` | 108 passed, 41 skipped (6 files passed, 4 skipped) |
| `npm run build` | Passed; pre-existing warnings only (`@theme` unknown at rule from lightningcss; chunk > 500 kB) |
| `npx vitest run tests/integration/profile.integration.test.js` | 6 passed, 0 failed |
| `npx playwright test` | 177 passed, 6 skipped, 0 failed |
| `tests/profile.spec.js` alone | 12 passed across Chromium, mobile Chrome and mobile Safari |
| Throwaway migration simulation | Passed; see section 4 |
| Hosted migration push and read-only verification | Completed; all 10 versions recorded remotely, 3/3 profiles, 0 missing |

The six skipped Playwright tests require `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` and were not run with credentials. Integration warnings about “Multiple GoTrueClient instances” come from the test harness creating several clients in one browser context; they do not indicate a runtime app defect.

## 6. Hallmark review (focused)

The review covered profile loading, success, error and recovery states only.

- Loading states use `aria-busy` and existing typography/status classes.
- Success state uses existing `detail-list`, `status-pill` and `form-actions` patterns.
- Error state now uses `role="alert"` and a real retry action; it no longer presents placeholder “Not set” details as if they were loaded data.
- No new colour, font, token or layout language was introduced. The existing logo/brand mark was preserved.
- `sloplint --scope app` on the two touched UI files reported:
  - file-level `focus-visible` false positive — a global `:focus-visible` rule already exists in `src/styles/base.css`
  - pre-existing em-dash/long-label findings in `DashboardConsumer.jsx`, unrelated to this fix
  - pre-existing `:active`/`:disabled` REFLEX notes on the profile form controls

No Hallmark redesign was performed; the existing design system remains intact.

## 7. Remaining issues

1. The migration push initially stopped at 003 because of the hosted `uuid-ossp` schema difference. This was resolved with a forward-only compatibility migration; no applied migration was edited. Future environments with the same extension layout are covered by that shim.
2. The hosted data preconditions are now verified, but the final dashboard render for the existing account has not been exercised by the agent because no account password or personal session was provided. The account owner should sign in once to confirm the UI end to end.
3. Browser credential-gated tests remain skipped; no personal credentials were used.
4. Build warnings listed in section 5 are pre-existing and unrelated to this repair.
5. No service-role key is present in frontend config; `src/lib/env.js` still rejects `VITE_SUPABASE_SERVICE_ROLE_KEY`.
