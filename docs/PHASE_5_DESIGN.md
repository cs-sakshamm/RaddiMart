# RADDIMART — Phase 5 Design Specification (Hallmark)

**Date:** 25 November 2026
**Designer:** Hallmark v2.0.0
**Status:** approved for implementation; implementation reviewed in `docs/PHASE_5_REPORT.md`
**Extension of:** the existing Coral system, Phase 3 consumer marketplace and Phase 4 collector
marketplace. No new design language, route family or component library.

---

## 1. Scope decision

The documented MVP lifecycle continues after collection:

```text
LISTED → PICKUP_REQUESTED → ACCEPTED → COLLECTED
      → IN_AGGREGATOR_INVENTORY → OFFERED_TO_RECYCLER
      → ACCEPTED_BY_RECYCLER → HANDOVER_CONFIRMED → COMPLETED
```

Phase 4 stops at `COLLECTED`. The next phase covers the aggregator’s part of that chain —
receiving collected material and offering it to a recycler — and stops at
`OFFERED_TO_RECYCLER`. Recycler acceptance, handover confirmation, final received weight,
payment status and the QR receipt remain Phase 6. Offering the whole aggregator and recycler
flow at once would mix two distinct actors and two distinct trust decisions.

A recycler facility profile is included because an offer must have a real, identified recipient;
the profile also makes verification status an explicit fact instead of an implication of the
role label.

**Explicitly not in Phase 5:** lot consolidation, recycler order acceptance/rejection, handover,
QR receipts, payments, realtime, GPS/radius search, AI classification.

---

## 2. Pages and routes

| Route | Purpose | Role | Navigation entry | Main actions | Required data | Access |
|-------|---------|------|------------------|--------------|---------------|--------|
| `/dashboard/aggregator` | Aggregator overview | aggregator | Dashboard | manage inventory, view offers | own + unassigned lots, own offers | aggregator RLS; other roles see access panel |
| `/aggregator/inventory` | Intake and own inventory | aggregator | Inventory | filter, receive lot, open lot | lots visible under RLS, catalogue | aggregator |
| `/aggregator/inventory/:id` | Lot detail and offer | aggregator | Inventory | receive lot, send offer, withdraw | lot, offer history, recycler directory | aggregator who owns it or may claim it |
| `/aggregator/offers` | Sent offers | aggregator | Offers | filter, open lot, withdraw | offers for own lots | aggregator |
| `/dashboard/recycler` | Recycler overview | recycler | Dashboard | manage facility, read offers | own facility, offers addressed to it | recycler |
| `/recycler/facility` | Facility profile | recycler | Facility | create/update profile; read verification | own facility, category catalogue | recycler |

All routes sit behind `ProtectedRoute`; the database policies remain the security boundary.

---

## 3. Workflow

```text
Collector marks collection complete
        │  (database trigger)
        ▼
IN_AGGREGATOR_INVENTORY, aggregator_id NULL        “Awaiting intake”
        │  aggregator receives the lot (atomic claim)
        ▼
aggregator_id = caller                              “In my inventory”
        │  aggregator sends an offer
        ▼
transactions.status = OFFERED_TO_RECYCLER           “Awaiting recycler”
        │  aggregator withdraws (mistake, renegotiation)
        ▼
transactions.status = WITHDRAWN                     history kept, lot offerable again
```

- **Starting state:** collection completed; lot exists automatically; no address copied.
- **Available actions:** receive an unassigned lot; open an owned lot; send one live offer;
  withdraw a live offer.
- **Confirmation:** receiving and withdrawing use explicit inline confirmations; sending an offer
  is a normal form submit with in-place success text.
- **Status transitions:** only the transitions above are accepted by the database trigger.
- **Success feedback:** the persisted row is re-read after every action; no invented success.
- **Error handling:** duplicate claim, duplicate live offer, invalid transition and expired
  access produce readable errors; the page remains usable.
- **Cancellation:** withdrawing an offer is the only cancellation in this phase; it never marks
  payment.

---

## 4. Dashboard design

- **Layout:** the shared top bar, then a 4-card summary, then task-focused sections.
- **Aggregator metrics:** lots awaiting intake, lots in my inventory, inventory weight, open
  offers. All are derived from loaded rows — no hard-coded production figures.
- **Recent activity:** the three most recent intake lots, three inventory lots and five offers.
- **Primary action:** “Manage inventory”; secondary “View offers”.
- **Recycler metrics:** offers received, open offers, withdrawn offers; facility identity with
  verification as text.
- **Empty states:** each section names what is missing and the action that fills it.
- **Loading:** page-level busy text; **error:** alert with retry/sign-in action.

---

## 5. Inventory and transaction interfaces

- **Cards before tables**, matching the Phase 4 listing language. Each card shows a short lot
  reference, category, subcategory, weight, condition, zone, status and its actions.
- **Filters:** inventory view (all / awaiting intake / my inventory), category, free-text search
  over lot code, zone and condition; 9 lots per page with previous/next.
- **Offers:** status filter, search over lot code/category/facility; offer cards show facility,
  rate per kg, estimated value, date and status. A live offer can be withdrawn after an inline
  confirmation.
- **Lot detail:** read-only material facts, privacy note, claim panel or offer panel, complete
  offer history. The offer form shows the estimated value live, labelled as an estimate.
- **Confirmation dialogs:** inline confirm panels rather than nested modals.

---

## 6. Responsive behaviour

- **Desktop (≥ 60 rem):** two-column detail/forms, 4 summary cards, 3-column filter row.
- **Tablet (40–60 rem):** forms become one column, filters 2 columns, cards stack actions.
- **Phone (< 40 rem):** one column, summary 2 × 2, status and action on their own rows, the
  navigation becomes one horizontally scrollable line rather than wrapping a lone “Sign out”.
  Desktop card rows are not shrunk; they restack.

---

## 7. Accessibility and interaction states

- Native form controls, visible labels above fields, `fieldset`/`legend` for category choices.
- 44 × 44 px minimum targets; buttons and nav links remain single-line.
- Visible `:focus-visible` ring; `:active` feedback; disabled while a request is in flight.
- Success messages use `role="status"`, errors use `role="alert"`.
- Status is always text plus colour.
- Verification is stated in words: “Verification pending / Verified by administrator /
  Verification rejected”; no claim of legal authorization.

---

## 8. Reuse and new components

**Reused:** `BrandMark` (unchanged logo), `DashboardNav`, `ProtectedRoute`, `.dashboard-*`,
`.listing-card`, `.summary-*`, `.status-pill`, `.filter-grid`, `.detail-list`, `.price-panel`,
`.btn`, `.form-*`, `.pagination`, `.empty-state`.

**New, token-only:** `.lot-code`, `.checkbox-grid`, `.confirm-panel`, status modifiers for
inventory/offers/verification, and the nested-form correction.

**New screens:** `DashboardAggregator` (rewritten from a shell), `AggregatorInventory`,
`AggregatorLotDetails`, `AggregatorOffers`, `DashboardRecycler` (rewritten), `RecyclerFacility`.
**New logic:** `src/lib/lots.js` (pure rules) and `src/lib/lotsApi.js` (Supabase access).

No second listing store, lot store, offer store, status machine or Supabase client was created.

---

## 9. Hallmark self-review before handoff

| Risk | Resolution |
|------|------------|
| Aggregator and collector screens could feel like different products | same nav, cards, summary, status and form language |
| Detail page could become a settings page | facts first, one action area, history last |
| Mobile nav wrapping | single scrollable row with 44 px targets |
| Double-card forms | transparent nested form surface |
| Offer amount could look guaranteed | plan language: “estimated”, “final value confirmed after handover”, “does not imply payment” |
| Verification could look like certification | status shown as an administrator-recorded fact, with explicit disclaimer |
| Recycler could be shown actions that do not exist yet | incoming offers are read-only and say acceptance is next phase |
