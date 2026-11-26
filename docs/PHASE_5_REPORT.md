# RADDIMART — Phase 5 Report: Aggregator Inventory and Recycler Offers

**Date:** 25 November 2026
**Scope:** lot traceability after collection, aggregator intake, inventory and offers, recycler
facility profile and read-only incoming offers
**Verdict: COMPLETE WITH LIMITATIONS (local).** Acceptance criteria below pass against the local
Supabase stack and a real browser. Nothing was deployed and no cloud project was modified.

---

## 1. What was implemented

| Area | Component | Route |
|------|-----------|-------|
| Aggregator overview | `src/components/DashboardAggregator.jsx` | `/dashboard/aggregator` |
| Intake and inventory | `src/components/AggregatorInventory.jsx` | `/aggregator/inventory` |
| Lot detail, claim and offer | `src/components/AggregatorLotDetails.jsx` | `/aggregator/inventory/:id` |
| Sent offers and withdrawal | `src/components/AggregatorOffers.jsx` | `/aggregator/offers` |
| Recycler overview | `src/components/DashboardRecycler.jsx` | `/dashboard/recycler` |
| Facility profile | `src/components/RecyclerFacility.jsx` | `/recycler/facility` |

Shared domain rules live in `src/lib/lots.js`; Supabase access in `src/lib/lotsApi.js`.

### Automatic lot creation

When a collector marks a listing `COLLECTED`, an `AFTER UPDATE` database trigger creates exactly
one `material_lots` row:

- collector, category, subcategory, estimated/actual weight, condition, zone, preferred time;
- `source_listing_id` (unique) for traceability;
- status `IN_AGGREGATOR_INVENTORY`, `aggregator_id` NULL;
- **no consumer street address is copied**; the lot carries the zone only;
- the consumer retains the address under `scrap_listing_addresses` RLS.

Existing collected listings were backfilled. A repeated update cannot create a second lot.

### Aggregator flow

- Dashboard counters and lists are derived from Supabase rows, never hard-coded.
- Intake shows only unassigned `IN_AGGREGATOR_INVENTORY` lots; receiving one is an atomic update
  matching `aggregator_id IS NULL`, so two aggregators cannot claim the same lot.
- Inventory supports view/category/search filters and 9-per-page pagination.
- Lot detail shows material facts, offer history and one live offer at a time.
- An offer records rate per kg and an **estimated** value; the UI states the final value is set
  after handover and does not imply payment.
- Withdrawing is confirmed inline, keeps the offer in history (`WITHDRAWN`) and allows a new
  offer.

### Recycler flow

- Facility profile is created and updated by the recycler: name, location, contact email and
  accepted top-level categories.
- Verification status is read-only and defaults to `pending`; a trigger restores it if the
  recycler tries to self-verify.
- The dashboard lists offers addressed to the facility, with status and estimated value.
  Accept/reject, handover and QR are explicitly deferred to Phase 6.

---

## 2. Database changes

One additive migration: `supabase/migrations/20261124000600_phase5_aggregator_inventory_and_offers.sql`.
Applied migrations 001–005 were not edited.

### Schema

| Change | Detail |
|--------|--------|
| `material_lots.subcategory_id` | FK to `material_categories`, `ON DELETE SET NULL` |
| `material_lots.source_listing_id` | FK to `scrap_listings`, **unique** (one lot per collection) |
| `material_lots.status` | CHECK extended with `IN_AGGREGATOR_INVENTORY` |
| `transactions.status` | CHECK extended with `WITHDRAWN` |
| Unique index | one `OFFERED_TO_RECYCLER` transaction per lot |
| Indexes | subcategory, source listing, aggregator + status |

### Functions and triggers

- `create_lot_on_collection()` — `SECURITY DEFINER`, one lot per completed collection.
- `enforce_material_lot_rules()` — an aggregator may only set their own `aggregator_id` on an
  unassigned lot; every other field, including status, is immutable.
- `enforce_transaction_rules()` — offers start as `OFFERED_TO_RECYCLER`, need a positive rate and
  `PENDING` payment; non-admins may only withdraw; protected columns cannot change.
- `enforce_recycler_rules()` — verification status and facility ownership cannot be self-changed.
- `is_lot_aggregator()`, `is_offer_recycler()`, `recycler_has_lot_offer()` — `SECURITY DEFINER`
  predicates that prevent recursive RLS across lots, offers and facilities.

### RLS

| Requirement | Enforcement |
|-------------|-------------|
| Consumers cannot read lots or offers | no matching SELECT policy |
| Approved aggregators see unassigned intake and their own lots | `current_active_role() = 'aggregator'` + ownership |
| Only one aggregator can receive a lot | UPDATE `USING aggregator_id IS NULL` + trigger |
| Aggregators cannot alter collected facts | trigger rejects every field except the assignment |
| Offers are private to the owning aggregator | `is_lot_aggregator(lot_id)` |
| A recycler sees only offers addressed to its facility | `is_offer_recycler(id)` |
| Recyclers can read the offered lot | `recycler_has_lot_offer(id)` |
| Recyclers cannot self-verify | INSERT forces `pending`; UPDATE trigger restores status |
| Admins retain oversight | existing admin policies |
| Direct API bypass | all checks above are database policies/triggers |

The over-broad Phase 2 transaction policies (“any authenticated user may read/insert any
transaction”) were replaced.

### Storage hardening

`scrap-listings` is now a **private** bucket. Permanent public URLs no longer serve objects;
signed URLs (24 h) are created for signed-in users, and uploads remain restricted to the owning
folder. This closes the Phase 4 “photos are publicly readable” limitation.

---

## 3. Files changed

**Added**

- `supabase/migrations/20261124000600_phase5_aggregator_inventory_and_offers.sql`
- `supabase/tests/003_phase5_rls_validation.sql`
- `src/lib/lots.js`, `src/lib/lotsApi.js`
- `src/components/AggregatorInventory.jsx`, `AggregatorLotDetails.jsx`, `AggregatorOffers.jsx`,
  `RecyclerFacility.jsx`
- `tests/lots.test.js`, `tests/integration/phase5.integration.test.js`, `tests/aggregator.spec.js`
- `docs/HALLMARK_UI_REVIEW.md`, `docs/PHASE_5_DESIGN.md`, `docs/PHASE_5_REPORT.md`
- Local-only review tooling: `scripts/review-capture.mjs`, `scripts/review-phase5.mjs`,
  `scripts/cleanup-review-fixtures.mjs`

**Modified**

- `src/components/DashboardNav.jsx` (new shared role-aware top bar), `DashboardAggregator.jsx`,
  `DashboardRecycler.jsx`
- `src/App.jsx` (Phase 5 routes; copy/link corrections from the review)
- `src/components/Popup.jsx` (native modal, styled sections)
- `src/components/DashboardConsumer.jsx`, `DashboardCollector.jsx`, `CollectorMarketplace.jsx`,
  `CollectorPickups.jsx`, `DashboardCreateListing.jsx`, `ListingDetails.jsx` (shared nav, date
  and metadata formatting, signed photo URLs, framing)
- `src/lib/listings.js` (Indian date formatting), `src/lib/listingsApi.js` (signed URLs)
- `src/styles/base.css` (missing public/dashboard/Phase 5 layers, token cleanups, focus/active)
- `src/styles/tokens.css` (`--color-on-brand`, `--color-error-pale`, `--color-scrim`)
- `tests/homepage.spec.js` (modal interaction and sentence-case copy), `tests/integration/phase4.integration.test.js`
  (private-photo assertion, zone-scoped assertion)
- `docs/DATABASE_SCHEMA.md`, `docs/AUTHENTICATION_AND_RBAC.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`

**Not changed:** the truck logo, brand palette, original migrations 001–005, phase 3/4 routes and
business rules, Supabase client singleton, cloud project.

---

## 4. Acceptance criteria and actual results

| Criterion | Result |
|-----------|--------|
| Collection creates exactly one traceable lot | Pass — SQL and integration tests |
| Lot contains no consumer street address | Pass |
| Only approved aggregators see intake | Pass — RLS validation + integration |
| One aggregator per lot; duplicate claim rejected | Pass |
| Aggregator cannot alter collected facts | Pass (0 rows / trigger rejection) |
| Only owning aggregator can offer | Pass |
| One live offer per lot | Pass — partial unique index |
| Recycler sees only offers addressed to it | Pass |
| Invalid offer transition rejected | Pass |
| Reactivation after withdrawal | Pass |
| Payment never changes automatically | Pass |
| Self-verification rejected | Pass |
| Photos no longer public | Pass |
| Phase 3/4 flows still work | Pass — full browser suite |
| Anonymous access denied | Pass |

### Test runs (final)

| Suite | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Build | `npm run build` | **Pass** — only the pre-existing >500 kB chunk warning |
| Unit + integration | `npx vitest run` with `INTEGRATION_*` | **Pass** — 74 tests (5 files) |
| Phase 5 SQL/RLS | `supabase/tests/003_phase5_rls_validation.sql` | **Pass** — all checks |
| Playwright, 3 devices | `npx playwright test` | **Pass** — 111 passed, 6 skipped, 0 failed |
| Hallmark `sloplint` | app scope on changed files | **0 FAIL**, 12 reviewed WARNs |

The 6 skipped Playwright tests are the pre-existing credential-gated sign-in/reset-email cases
that require an actual mailbox; no result is claimed for them.

---

## 5. Known limitations

- **Local only.** No cloud migration or deployment was performed. The remote project still has
  zero applied migrations.
- **Recycler response is not implemented.** Offers stop at `OFFERED_TO_RECYCLER`. Acceptance,
  handover, received weight, payment status and QR verification are Phase 6.
- **No lot consolidation.** Compatible-lot merging remains a later aggregator feature.
- **No realtime.** Pages refresh on navigation and after each action.
- **Search is substring matching** on lot code, zone, condition, category or facility; no
  full-text index.
- **No geolocation/radius.** Zones are strings.
- **Verification workflow is manual.** An administrator must set `verification_status`; there is
  no admin UI for it in this phase.
- **Facility categories are names**, not foreign keys, matching the existing `recyclers` schema.
- **Photos are visible to any signed-in user**, not only the owner and assigned collector. The
  bucket is no longer public, but per-record photo RLS would require a broader Storage policy
  redesign.
- Local review screenshots and fixtures are development-only and cleaned up; no fabricated data
  ships in the application.

---

## 6. Next phase

Phase 6 should implement the recycler side of the existing transaction:
`ACCEPTED_BY_RECYCLER → HANDOVER_CONFIRMED → COMPLETED`, independent `payment_status`, final
received weight, handover record and the read-only QR verification page. It must extend the
`transactions`/`handover_records` tables and reuse the Phase 5 offer ownership rules.
