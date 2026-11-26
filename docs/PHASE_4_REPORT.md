# RADDIMART — Phase 4 Report: Collector Marketplace

**Date:** 2026-11-25
**Scope:** collector dashboard, marketplace, listing details, pickup request/acceptance and pickup management
**Verdict: COMPLETE (local).** All Phase 4 acceptance criteria and tests pass against the local
Supabase backend. Not deployed and not verified in production.

---

## 1. What was built

Phase 4 reuses the existing consumer listing table (`scrap_listings`) and the Phase 3 design
system. No second listing store, no new state machine and no new service instances were added.

| Area | Component | Route |
|------|-----------|-------|
| Collector dashboard | `src/components/DashboardCollector.jsx` | `/dashboard/collector` |
| Marketplace with filters + pagination | `src/components/CollectorMarketplace.jsx` | `/collector/marketplace` |
| Listing details (consumer and collector views, accept/collect) | `src/components/ListingDetails.jsx` | `/listing/:id` |
| Pickup management (pending / accepted / completed) | `src/components/CollectorPickups.jsx` | `/collector/pickups` |

Shared, tested domain logic lives in `src/lib/listings.js`; Supabase access lives in
`src/lib/listingsApi.js`.

### Dashboard

Real Supabase data only — no hard-coded statistics. Four counters (available listings, pickup
requests, accepted pickups, completed collections), the newest available listings, the
collector's accepted pickups and recent activity. Loading, empty and error states are all
rendered. Non-collectors see a "Collector access required" panel with a role-request link
instead of marketplace data.

### Marketplace

Cards show category/subcategory, estimated weight, condition, pickup zone, preferred pickup
time, listing date and optional photo, plus the indicative amount derived from the active rate
card. **The consumer's full address is not shown at this stage.** Filters: category,
subcategory, pickup zone, status and free-text search (condition/zone). Paging is server-side
(`range`), 9 rows per page with an exact count.

### Listing details

Material and pickup information, the indicative amount and an explicit statement that the price
is indicative and may change after weighing/inspection — never presented as a guaranteed
payment. Consumers see their full address and can request pickup, edit, or cancel while the
listing is unclaimed. Collectors see the zone only until they accept; after accepting, the full
address and the "mark as collected" action appear.

### Pickup workflow (implemented subset)

The existing status column already models the pickup lifecycle, so no transaction record is
created for a pickup. The semantics used:

```text
LISTED ──(consumer requests pickup)──▶ PICKUP_REQUESTED
   │                                        │
   └────(collector accepts)─────────────────┴──▶ ACCEPTED ──(collector records collection)──▶ COLLECTED
                                                   │
                                                   └──(collector releases)──▶ PICKUP_REQUESTED
LISTED / PICKUP_REQUESTED ──(consumer cancels)──▶ CANCELLED
```

- "Available listing" = `LISTED` or `PICKUP_REQUESTED` with no collector.
- "Pending pickup request" = `PICKUP_REQUESTED` with no collector.
- `IN_AGGREGATOR_INVENTORY`, `OFFERED_TO_RECYCLER`, `ACCEPTED_BY_RECYCLER`,
  `HANDOVER_CONFIRMED`, `COMPLETED` exist on `transactions` for later phases and are **not**
  implemented here. Aggregator and recycler functionality was not built.
- Duplicate acceptance is impossible: the claim update matches only `collector_id IS NULL`, and
  a second attempt updates zero rows (surfaced as "already accepted").
- Invalid transitions are rejected by a database trigger, not only by the UI.

### UX

Existing tokens, `BrandMark` (original truck logo) and the Hallmark palette are untouched. The
new screens reuse the existing `.dashboard-*`, `.listing-card`, `.btn`, `.form-group` class
names and add a token-only component layer to `src/styles/base.css` (those classes had no
definitions before). Layouts are responsive; all interactive controls are ≥ 44 px; forms have
labels, `aria-live` price updates, `role="alert"` errors and loading/empty states. No new
animations, AI classification, GPS tracking or payments were introduced.

---

## 2. Database changes

Two additive migrations were required; applied migrations 001–003 were not edited.

### `20261124000400_phase3_rls_and_collector_marketplace.sql`

- `is_admin()` / `current_active_role()` helpers; replaced recursive `profiles` policies.
- `handle_new_user` trigger + profile backfill.
- Replaced `handle_profiles_update` (the old version silently reverted approved role changes).
- `scrap_listings.subcategory_id`; `CANCELLED` status; indexes on subcategory and zone.
- RLS for `scrap_listings` and `material_lots` plus `scrap_listings_rules` trigger.
- Storage bucket `scrap-listings` and owner-folder policies.

### `20261124000500_listing_address_privacy.sql`

- New `scrap_listing_addresses(listing_id PK, address, timestamps)` with owner/assigned-collector
  RLS; backfilled from `scrap_listings.pickup_location`, then dropped that column so the
  address cannot leak through the marketplace-readable row.

### Security / RLS summary

| Requirement | Enforcement |
|-------------|-------------|
| Only approved collectors access marketplace rows | `current_active_role() = 'collector'` in the SELECT policy |
| Consumers see only their own listings | `consumer_id = auth.uid()` |
| One collector per pickup | claim `USING` requires `collector_id IS NULL` |
| Only the assigned collector updates a pickup | `USING (collector_id = auth.uid())` + trigger |
| Consumers cannot modify collector-only fields | trigger rejects `collector_id`/`actual_weight` writes |
| Collectors cannot alter material terms | trigger restores category/weight/condition/zone/time/photo |
| No invalid status transitions | trigger raises on undocumented transitions |
| Address hidden until accepted | `scrap_listing_addresses` RLS |
| No self role approval / escalation | `approve_role_request`, `handle_profiles_update` |
| Direct API bypass | all of the above are database policies/triggers, not route guards |

No service-role key is used anywhere in `src/`.

---

## 3. Files changed

**Added**

- `supabase/migrations/20261124000400_phase3_rls_and_collector_marketplace.sql`
- `supabase/migrations/20261124000500_listing_address_privacy.sql`
- `supabase/seed.sql`
- `supabase/tests/002_phase3_phase4_rls_validation.sql`
- `src/lib/listings.js`, `src/lib/listingsApi.js`
- `src/components/ListingDetails.jsx`, `CollectorMarketplace.jsx`, `CollectorPickups.jsx`
- `tests/listings.test.js`, `tests/integration/phase4.integration.test.js`, `tests/collector.spec.js`
- `docs/PHASE_3_REPORT.md`, `docs/PHASE_4_REPORT.md`

**Modified**

- Migration files renamed to unique versions: `20261124000100_…`, `20261124000200_…` (comment
  signature + `NOT FOUND` fix), `20261124000300_…`
- `src/App.jsx` (routes, nav anchors, footer `id="contact"`)
- `src/components/DashboardConsumer.jsx`, `DashboardCreateListing.jsx`, `DashboardCollector.jsx`
- `src/components/SignInPage.jsx`, `SignUpPage.jsx`, `RoleRequestPage.jsx`,
  `ResetPasswordPage.jsx` (import fixes, reset-password explanation, requestable-role list,
  rendered errors and associated labels)
- `src/config/brand.js` (`REQUESTABLE_ROLES`)
- `src/styles/base.css` (component layer)
- `tests/homepage.spec.js`, `tests/auth.spec.js` (locator corrections only)
- `eslint.config.js` (Node globals for tests/tooling; ignore generated reports)
- `package.json` / `package-lock.json` (`test`, `test:watch`, `test:ui` scripts; declared
  `vitest`, `@playwright/test`, `jsdom`)
- `docs/DATABASE_SCHEMA.md`, `docs/AUTHENTICATION_AND_RBAC.md`, `.github/workflows/ci.yml`

**Not changed:** the truck logo/brand assets, tokens, landing page content, aggregator/recycler
dashboards, Supabase client singleton, cloud project.

---

## 4. Environment requirements

Browser-safe only:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local publishable/anon key>
```

Test-only (server side, never exposed to the browser or committed):

```
INTEGRATION_SUPABASE_URL, INTEGRATION_SUPABASE_ANON_KEY, INTEGRATION_SUPABASE_SERVICE_KEY
```

The integration suite **skips with a warning** when these are absent. To run the Phase 4
browser tests the app must be built with the same local `VITE_` values:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<local key> \
INTEGRATION_SUPABASE_URL=http://127.0.0.1:54321 \
INTEGRATION_SUPABASE_ANON_KEY=<local key> \
INTEGRATION_SUPABASE_SERVICE_KEY=<local service key> \
npx vite build && npx playwright test
```

---

## 5. Tests run and actual results

| Suite | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Build | `npm run build` | **Pass** — pre-existing >500 kB chunk warning only |
| Unit | `npm run test` | **Pass** — 32 unit tests (filtering, transitions, price, summaries, pagination) |
| DB integration | `npm run test` with `INTEGRATION_*` set | **Pass** — 14 tests over real PostgREST/Auth/Storage (total 46 tests) |
| RLS/workflow SQL | `psql -f supabase/tests/002_phase3_phase4_rls_validation.sql` | **Pass** — all checks |
| Playwright (3 devices) | `npx playwright test` | **Pass** — 102 passed, 6 skipped, 0 failed |

Unit coverage requested by the spec:

- Listing filtering — `filterListings` (category, subcategory, zone, status, search, combined,
  null-safe) in `tests/listings.test.js`.
- Status transition validation — `canTransition` (allows the documented chain, rejects
  `ACCEPTED → CANCELLED`, treats `COLLECTED`/`CANCELLED` as terminal).
- Indicative price — `calculateIndicativePrice` (rounding, invalid/zero/missing input).
- Dashboard transformations — `summariseCollectorListings` (counts, ownership filtering, recent
  activity order, empty input).

Integration coverage: eligible listing retrieval, claim, duplicate claim, other-collector
takeover blocked, consumer blocked after acceptance, completion, address visibility, storage
upload scoping, anonymous denial.

Playwright coverage: collector sign-in + dashboard, browse/filter, open details, accept pickup,
pickup management, complete collection, collector role request submission, non-collector
rejection — on Chromium, Pixel 5 and iPhone 12.

Collector onboarding detail: the role form previously submitted `collector`, which the
`role_requests` CHECK constraint rejects. It now offers `local_collector` / `aggregator` /
`recycler` (matching the approved role identifiers) and renders submission errors. This was
required for a real Kabadiwala to obtain collector access, so it is included in Phase 4.

---

## 6. Known limitations

- **Local verification only.** Nothing was pushed to the cloud project; `deploy-production` was
  not run. The remote project still has zero applied migrations.
- **Six Playwright tests skipped** (credential-gated sign-in and reset email). They were not
  executed.
- **No aggregator/recycler stages.** The later states in the transaction workflow remain for
  Phase 5+; `material_lots`/`transactions` are not used by Phase 4.
- **No realtime updates.** Dashboard/marketplace refresh on navigation and after actions; there
  are no Supabase realtime subscriptions (deliberate — avoids duplicate subscriptions).
- **Search is limited** to condition and zone text; category/subcategory/zone/status are exact
  filters. There is no full-text index yet.
- **Photos are publicly readable** by URL (unguessable path, bucket policy allows public read,
  owner-only write). A private bucket with signed URLs would be the next hardening step.
- **No geolocation/radius search**; zone filtering is string matching.
- `scrap_listings` has no DELETE policy — cancellation preserves history.
- The `[supabase]` section warning in `supabase/config.toml` is cosmetic and was left untouched.

---

## 7. Manual verification steps

```bash
supabase start
supabase db reset                 # applies 001–005 + seed
npm run dev                       # http://localhost:5173

# Collector
# 1. Sign up as a new user, submit a collector role request (/role-request).
# 2. Approve it in Studio or with SQL:
#    SELECT approve_role_request('<request-id>', 'approved', 'manual check');
# 3. Sign out and in: the dashboard lands on /dashboard/collector with real counters.
# 4. Browse /collector/marketplace, filter by zone, open a listing (zone only, no address).
# 5. Accept the pickup → the address appears; the marketplace no longer lists it.
# 6. /collector/pickups → open the accepted pickup → enter actual weight → mark collected.
# 7. Confirm it appears under Completed Collections and disappears from pending lists.

# Consumer
# 8. As the listing owner, confirm you can edit/cancel only before acceptance, and that the
#    indicative price is labelled as indicative.

# Negative checks
# 9. As a consumer, /collector/marketplace shows "Collector access required".
# 10. As another user, querying scrap_listings / scrap_listing_addresses via the API returns
#     no rows for data you do not own.
```
