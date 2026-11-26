# Material categories fix report

Date: 2026-11-26

## 1. Symptom

A signed-in consumer opening `/dashboard/create-listing` saw:

> No material categories have been configured yet. Please contact an administrator.

This message only renders when the catalogue request succeeds but returns zero parent
categories (`DashboardCreateListing.jsx`, `fetchCatalogue` in `src/lib/listingsApi.js`).
It is not a permission, network or rate-card error state.

## 2. Root cause

Inspection of `DashboardCreateListing.jsx`, `listingsApi.js`, the auth components,
the Supabase schema/migrations/RLS, `supabase/seed.sql`, and the existing listing tests
showed the following:

- `material_categories` is the single category table. It is self-referencing:
  `parent_id IS NULL` means parent category; `parent_id` plus
  `is_subcategory = TRUE` means subcategory. There is no `is_active` column on
  categories; only `price_rates.is_active` exists.
- `fetchCatalogue()` selects all categories with RLS permitted and maps only
  `parent_id IS NULL` rows into the category dropdown.
- RLS already allows every authenticated user to `SELECT` categories and restricts
  writes to admins (`Only admins can modify categories`). The hosted policies were
  present and correct.
- `supabase/seed.sql` contains the 5 parent categories, 21 subcategories and 5
  indicative rate cards, but it is explicitly local-only. Supabase does not apply
  `seed.sql` on a remote `db push`.
- Actual data confirmed the cause:

| Database | `material_categories` rows | Parents | Subcategories | Active rates |
| --- | ---: | ---: | ---: | ---: |
| Local Supabase (seeded) | 26 | 5 | 21 | 5 |
| Hosted Supabase (before fix) | 0 | 0 | 0 | 0 |

No auth role, signup, sign-in, route guard or category filter was responsible. The
frontend was correctly reporting a genuinely empty hosted catalogue.

## 3. Fix

### Database

Added the additive, forward-only migration
`supabase/migrations/20261126000200_catalogue_bootstrap_and_listing_validation.sql`.

It:

- installs the same 5 parent categories and 21 subcategories with the stable IDs
  from `supabase/seed.sql`;
- installs the 5 documented local-default rate cards;
- uses `ON CONFLICT (id) DO NOTHING` plus name/parent existence guards, so it is
  idempotent and preserves an existing administrator-managed taxonomy;
- never adds a second active rate for a category;
- adds `scrap_listings_catalogue_reference`, a `BEFORE INSERT OR UPDATE` trigger
  that rejects a missing category, a subcategory used as the parent, or a
  subcategory belonging to a different parent. Admins retain their existing
  repair path through `public.is_admin()`.

No RLS policy, grant or table-level RLS setting was disabled. No existing row was
deleted, renamed or overwritten. No user accounts or listings were seeded.

### Frontend

- `src/lib/listingsApi.js`: defensively ignores inactive rate rows even if a
  client accidentally receives one. The PostgREST query still filters
  `is_active = true`.
- `src/components/DashboardCreateListing.jsx`:
  - keeps the configured empty-state message for a genuinely unconfigured catalogue;
  - adds a **Retry loading catalogue** button to the catalogue error state;
  - marks the loading state with `role="status"`;
  - rejects stale/invalid category and subcategory IDs before calling the API;
  - continues to reset the subcategory when the category changes and to preserve
    entered values when submission fails.
- `src/styles/base.css`:
  - styles the catalogue error/retry group;
  - fixes the disabled-button state to use fill, ink and cursor rather than
    opacity alone;
  - raises form hint text to 14px on narrow screens.

The seed file was not edited. The taxonomy remains database-owned; no hardcoded
fallback category list was introduced into React.

## 4. Deployment of the migration

With the user's explicit approval:

1. `supabase migration up --local` applied the migration locally.
2. `supabase/tests/005_catalogue_validation.sql` passed locally.
3. `supabase db push --remote --dry-run` showed only the new migration.
4. `supabase db push --remote --yes` applied it to the linked hosted project.

Post-migration hosted verification (read-only):

| Check | Result |
| --- | ---: |
| Total categories | 26 |
| Top-level parents | 5 |
| Subcategories | 21 |
| Active rates | 5 |
| Duplicate parent names | 0 |
| Duplicate subcategory names | 0 |
| `scrap_listings_catalogue_reference` trigger | present |
| Consumer category `SELECT` policy | present |
| Admin category modify policy | present |

No frontend deployment was performed as part of this fix.

## 5. Tests added

- `tests/catalogue.test.js`: `fetchCatalogue` hierarchy, empty result, category
  read error, rate read error, inactive-rate filtering, and `createListing` ID,
  owner, field, null-mapping and compensating-delete behaviour.
- `tests/create-listing.test.jsx`: category/subcategory rendering, subcategory
  reset, loading/error/retry/empty states, required-field validation, stale
  category rejection, preserved values after failure and successful submission
  mapping.
- `tests/integration/catalogue.integration.test.js`: real local Supabase checks
  that a signed-in consumer reads the hierarchy and rate, creates a listing with
  the selected IDs, and cannot submit a mismatched subcategory. Skips without
  loopback integration variables.
- `tests/create-listing.spec.js`: Playwright E2E across Chromium, mobile Chrome
  and mobile Safari, using real local Supabase, that signs in as a consumer,
  loads seeded categories, selects a subcategory, submits the form and verifies
  the stored listing and address. Skips without loopback integration variables.
- `supabase/tests/005_catalogue_validation.sql`: catalogue shape, idempotency,
  consumer `SELECT` under RLS, non-admin write denial, and valid/invalid listing
  category references.

## 6. Verification results

| Command | Result |
| --- | --- |
| `npm run lint` | Passed, 0 errors |
| `npm run build` | Passed; pre-existing Lightning CSS `@theme` and >500 kB chunk warnings only |
| `npm test` with local Supabase integration variables | 14 files passed; 167 tests passed |
| `npx playwright test` with local Supabase integration variables | 180 passed; 6 skipped |
| `supabase/tests/005_catalogue_validation.sql` against local DB | `CATALOGUE VALIDATION: ALL CHECKS PASSED` |
| Hosted post-migration read-only queries | 26 categories / 5 parents / 21 subcategories / 5 rates, no duplicates |

The 6 skipped Playwright cases are the two credential-dependent `auth.spec.js`
tests (real sign-in and password recovery) across the three device projects. They
require `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`; no test user was created for them.

All backend integration tests were run against loopback Supabase only. The hosted
project was written to only by the approved forward-only migration.

## 7. Hallmark mobile review

A focused Hallmark review was run on the Consumer New Listing page; it was an
audit of the existing design, not a redesign. Screenshots for success, loading,
catalogue error and configured empty states were captured at 390 x 844 and 1440 x 900
under `.hallmark/review/catalogue-fix/`.

Neither this model nor the audit subagent could consume image input, so the visual
screenshots could not be inspected directly. The audit therefore used rendered DOM
metrics, computed CSS, source review and `sloplint`; this limitation is recorded
rather than claimed as a visual pass.

Rendered checks at 390 x 844 for all four states:

- horizontal overflow: `0px`;
- interactive targets below 44px: none;
- labels are bound to controls;
- loading uses `role="status"`, errors use `role="alert"`;
- the retry button is reachable after a catalogue failure;
- the form collapses to one column and scrolls vertically.

Findings addressed:

- loading state now exposes `role="status"`;
- form hints are 14px on narrow screens;
- disabled buttons no longer rely on opacity alone.

Final `sloplint` on `DashboardCreateListing.jsx` and `base.css`:

- `0 FAIL`;
- 2 REFLEX and 8 WARN remain, all on existing shared patterns outside this
  focused fix (`.listing-info`, `.status-pill`, side stripes, auth/material card
  measures and global button recipes).

## 8. Files changed

- `supabase/migrations/20261126000200_catalogue_bootstrap_and_listing_validation.sql` (new)
- `supabase/tests/005_catalogue_validation.sql` (new)
- `tests/catalogue.test.js` (new)
- `tests/create-listing.test.jsx` (new)
- `tests/integration/catalogue.integration.test.js` (new)
- `tests/create-listing.spec.js` (new)
- `src/components/DashboardCreateListing.jsx`
- `src/lib/listingsApi.js`
- `src/styles/base.css`
- `tests/setup.js`
- `docs/MATERIAL_CATEGORIES_FIX_REPORT.md` (new)
- `AGENTS.md` (documentation index only)
