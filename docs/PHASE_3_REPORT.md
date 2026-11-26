# RADDIMART — Phase 3 Report: Consumer Scrap Marketplace + Migration Recovery

**Date:** 2026-11-25
**Scope:** migration recovery, Phase 3 consumer listing workflow, backend/RLS/storage verification
**Verdict:** Phase 3 is **verified against a real local Supabase backend** (database, RLS and
Storage), after repairing the migration chain and several blocking defects listed below. It is
**not** production-verified: no cloud project was migrated or deployed.

---

## 1. Migration status

### 1.1 Blockers found

| # | Blocker | Evidence | Fix |
|---|---------|----------|-----|
| 1 | `COMMENT ON FUNCTION approve_role_request(is text, status text, review_note text)` | `ERROR: function approve_role_request(text, text, text) does not exist (SQLSTATE 42883)`. The function is declared `(p_request_id UUID, p_status TEXT, p_review_note TEXT)`. | Comment signature corrected to `approve_role_request(uuid, text, text)`. Function body and security logic untouched. |
| 2 | All three migration files shared version `20261124` | After fix 1, `supabase start` failed with `duplicate key value violates unique constraint "schema_migrations_pkey"` — the CLI parses the version as everything before the first `_`. | Files renamed to unique timestamps `20261124000100`, `20261124000200`, `20261124000300` with identical content and order. `supabase migration list --linked` confirmed the remote project had **0** migrations recorded, so no applied migration was altered. |
| 3 | `IF v_request IS NULL` after `SELECT INTO` | A `%ROWTYPE` record is never NULL after `SELECT INTO` when no row matches; the "not found" guard never fired. | Changed to `IF NOT FOUND`. Behaviour otherwise unchanged. |

### 1.2 Local recovery procedure used

1. `supabase status` — no local stack running (`supabase_db_RADDIMART` absent).
2. `supabase migration list --remote` (read-only) — remote project has **no** applied migrations.
3. Renamed the three migration files (above).
4. `supabase start` — started the stack.
5. `supabase db reset` — **local only** (target line reads `local stack (127.0.0.1:54322)`). The
   local database contained only the partially applied Phase 2 schema from the failed
   initialisation and no application data, so nothing user-owned was lost. Docker volumes were
   not deleted manually; the CLI performed the reset. No remote command was run.

### 1.3 Result

```
supabase migration list
  Local            | Local DB
  20261124000100   | 20261124000100
  20261124000200   | 20261124000200
  20261124000300   | 20261124000300
  20261124000400   | 20261124000400
  20261124000500   | 20261124000500
```

`supabase status` reports API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio
`127.0.0.1:54323`, Storage enabled.

> Pre-existing cosmetic warning: `supabase/config.toml` contains a `[supabase]` section that
> this CLI version ignores. It does not affect startup; the file was left unchanged.

---

## 2. Phase 3 defects found during backend verification

Verification was performed against the real local database, not mocks. The Phase 3 surface did
not work end to end:

| # | Defect | Impact |
|---|--------|--------|
| 1 | RLS was **never enabled** on `scrap_listings` | Any authenticated (and, where grant allows, anonymous) caller could read and write every consumer listing. |
| 2 | `profiles` admin policy queried `profiles` itself | `infinite recursion detected in policy for relation "profiles"` on any read that touched another profile. Reproduced before the fix. |
| 3 | `handle_profiles_update` compared the **target** user's admin flag instead of the caller's | Every `active_role` change was reverted for non-admins — `approve_role_request()` could never actually promote anyone. |
| 4 | No `handle_new_user` trigger existed | Phase 2 documentation claimed profiles were auto-created on signup; they were not, so new accounts had no profile row. |
| 5 | `DashboardCreateListing` inserted `category` and `subcategory` text columns | Those columns do not exist (`scrap_listings` uses `category_id`), so listing creation always failed at the database. |
| 6 | Subcategory `<select>` had no `onChange` | A subcategory could never be chosen. |
| 7 | No Storage bucket or policies for `scrap-listings` | Every photo upload failed. |
| 8 | Routes `/create-listing` and `/listing/:id` did not exist | Consumer dashboard links led to the 404 redirect. |
| 9 | `SignInPage`, `SignUpPage`, `RoleRequestPage` imported `useNavigate` from `react` | Sign-in, sign-up and role-request crashed with `(0, _.useNavigate) is not a function`. |
| 10 | Reset-password page rendered nothing without a recovery session | Direct visits showed an empty card with no explanation. |
| 11 | Listing addresses were readable by every collector via the API | Full consumer address exposed before accepting a pickup. |
| 12 | Role-request form submitted `collector`, but `role_requests.requested_role` only allows `local_collector`/`aggregator`/`recycler` | Collector onboarding was impossible; every request would be rejected by the CHECK constraint. The form's error state was also never rendered (state was named `Error`). |

### Repairs

- **Migration 004** (`20261124000400_phase3_rls_and_collector_marketplace.sql`):
  RLS helper functions, replacement of every recursive `profiles` subquery policy, profile
  auto-creation + backfill, `subcategory_id`, `CANCELLED` status, `scrap_listings` and
  `material_lots` RLS, listing integrity trigger, Storage bucket and policies, and the
  role-guard trigger fix.
- **Migration 005** (`20261124000500_listing_address_privacy.sql`):
  `scrap_listing_addresses` table, backfill, address column removal, address RLS.
- **Seed** (`supabase/seed.sql`): administrator-managed material categories/subcategories and
  local development rate cards. Local only — Supabase never applies `seed.sql` remotely. No
  accounts or listings are seeded.
- **Frontend**: `src/lib/listings.js`, `src/lib/listingsApi.js`, rewritten
  `DashboardCreateListing`, new `ListingDetails`, rewritten `DashboardConsumer`, auth import
  fixes, reset-password explanation, routes `/listing/:id`.
- **Role request**: `REQUESTABLE_ROLES` (`local_collector`, `aggregator`, `recycler`) with
  labels, rendered error state, field labels associated with inputs, and a confirmation view
  after submission.

---

## 3. Verification results

### 3.1 Database / RLS (`supabase/tests/002_phase3_phase4_rls_validation.sql`)

Run with role impersonation (`SET LOCAL ROLE authenticated` + `request.jwt.claims`) against the
local database. **All checks pass** (`PHASE 3/4 RLS VALIDATION: ALL CHECKS PASSED`):

1. Profile visibility — consumer sees only their own profile; administrator sees all
   (regression test for the recursion bug).
2. Self role/admin escalation through a direct profile write is rejected.
3. Consumer can create a listing only for themselves; spoofed `consumer_id` is rejected.
4. Another consumer, an aggregator and anonymous callers see zero marketplace rows.
5. Collector sees the open listing and cannot see cancelled listings.
6. Collector claim updates exactly one row; a second claim updates zero; an aggregator cannot claim.
7. Consumer cannot cancel or write collector fields on an accepted listing.
8. Assigned collector cannot rewrite zone or weight; the live row keeps its original values.
9. Pickup address: assigned collector reads it; unrelated roles read zero rows; owner reads own.
10. `ACCEPTED → COLLECTED` succeeds; `COLLECTED → LISTED` is rejected; completed pickups remain
    visible to their collector; another user cannot modify them.
11. `approve_role_request`: self-approval rejected; admin approval sets `status = approved` and
    maps `local_collector → collector`.
12. Role request submission over HTTP: a consumer can create only their own request, reads only
    their own request, another consumer reads none, and self-approval through the RPC fails.

### 3.2 Storage

Verified over HTTP with real signed-in users (`tests/integration/`):

- Consumer uploads `listings/<their-uid>/probe.png` → success, public URL returns HTTP 200.
- Consumer B uploading into Consumer A's folder → rejected by policy.
- Anonymous listing reads → zero rows.

### 3.3 Build, lint and tests

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | Pass (0 errors, 0 warnings) |
| Build | `npm run build` | Pass (only the pre-existing >500 kB chunk warning) |
| Unit tests | `npm run test` | Pass — 32 unit tests (`env-config`, `listings`) |
| Backend integration | `npm run test` with `INTEGRATION_*` set | Pass — 14 tests (real PostgREST/Auth/Storage) |
| Playwright | `npx playwright test` | Pass — 102 passed, 6 skipped (credential-gated), 0 failed |

### 3.4 Previously failing Playwright tests — classification

Reproduced and classified rather than dismissed:

| Test(s) | Cause | Resolution |
|---------|-------|------------|
| `auth.spec.js` sign-in / sign-up / protected-route auth pages | Stale `dist/` from before the SPA routes existed, then a genuine `useNavigate` import crash in `SignUpPage` | Fixed the import; tests now run against a fresh build. |
| `auth.spec.js` sign-up / reset-password | Strict-mode locator collision (`/Password/` matched both Password and Confirm Password; `/New Password/` matched Confirm New Password) | Locators made exact — the page markup was correct. |
| `homepage.spec.js` navigation scroll | Two links named "How It Works" (nav + footer) → strict-mode violation; and the nav pointed at `/#about`, a section that does not exist | Test scoped to the main navigation; nav hrefs corrected (`/#how-works`) and `id="contact"` added to the footer. |
| `responsive.spec.js` touch targets (21px) | Nav and button classes referenced by the app had no CSS at all | Added a component layer using existing tokens; all interactive targets are ≥ 44px. |
| `collector.spec.js` (Phase 4) | Test navigated before the sign-in request completed; concurrent tests saw each other's seeded listings | Sign-in helper now waits for the dashboard URL; each test filters by its own unique zone. |

---

## 4. Remaining failures / limitations

- No test failures remain in the runs above.
- Six Playwright tests are **skipped** by design because they need `TEST_USER_EMAIL` /
  `TEST_USER_PASSWORD` (live sign-in and password-recovery email). They were not executed.
- No production verification: the linked cloud project was read (`migration list --remote`) but
  never migrated, written to or deployed.
- `scrap_listings` has no `DELETE` policy: consumers cancel instead of deleting, preserving
  history. This is intentional.
- Listing search covers condition and zone only; category/subcategory use server-side selects.

## 5. Manual verification steps

```bash
supabase start
supabase db reset            # applies 001–005 and supabase/seed.sql
# 1. open http://localhost:5173, sign up, create a listing with a photo
# 2. confirm the indicative price uses the seeded category rate
# 3. edit/cancel while the listing is unclaimed (actions disappear after acceptance)
# 4. check the Supabase Studio table editor for scrap_listings + scrap_listing_addresses
```
