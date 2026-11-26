# RADDIMART — Architecture

Status: Phase 0 foundation. This document describes the intended architecture, not a claim that later-phase features are implemented. Items marked **subject to review** are decisions that remain open for Hallmark, the project owner or backend design review.

## 1. Overall system architecture

```text
Browser (phone / tablet / desktop)
  └── React + Vite + Tailwind CSS single-page application
        ├── Supabase JS client (browser-safe publishable/anon key only)
        ├── Planned client-side QR rendering for verification URLs
        └── HTTPS to Supabase
              ├── Supabase Auth
              ├── PostgreSQL database with Row-Level Security
              └── Supabase Storage

GitHub repository → Cloudflare Pages build → hosted static application
```

The application is web-first and responsive. There is no independent Express backend in Phase 0; an API layer is introduced only if a concrete requirement justifies it. Business rules that must be trusted are planned as database constraints, protected PostgreSQL functions or RLS policies, not as frontend-only checks.

## 2. Frontend architecture

Phase 0 establishes the following structure:

```text
src/
  app/          Planned route-level composition (empty in Phase 0)
  assets/       Local image assets
  components/   Reusable UI components; BrandMark is present
  config/       Brand names, roles and lifecycle constants
  hooks/        Planned shared hooks
  lib/          Supabase client and environment validation
  styles/       Tokens, base rules and Tailwind entry
  utils/        Planned pure helpers
  App.jsx       Minimal foundation screen
  main.jsx      React root
```

- `main.jsx` mounts React in strict mode and imports the global stylesheet.
- `App.jsx` is a foundation verification screen only. It is not the landing page.
- `BrandMark.jsx` renders the supplied truck illustration at its natural aspect ratio from `public/assets/raddimart-logo/`. The original file in `Brand-Assets/` is unchanged.
- `config/brand.js` holds the official name, tagline, primary colour, role names and lifecycle constants.
- `lib/env.js` accepts either a Supabase publishable key or the browser-safe anonymous key and rejects any `VITE_SUPABASE_SERVICE_ROLE_KEY`.
- `lib/supabase.js` lazily creates a Supabase client and returns `null` when credentials are absent, so the foundation can render without a backend.
- Tailwind CSS v4 is wired through `@tailwindcss/vite`. Design values are exposed as tokens; utilities consume tokens rather than inline brand hex values.

Routing, authentication screens and dashboards are **not implemented** in Phase 0. A router is planned for a later phase; library choice is **subject to review**.

## 3. Supabase backend architecture

The Supabase project supplies three services:

1. **Auth** for user identity and sessions.
2. **PostgreSQL** for all relational records, constraints, enums/check constraints and RLS.
3. **Storage** for optional scrap reference photographs.

At inspection and at the end of Phase 0, no Supabase URL or browser-safe key was configured, and no live Supabase project was queried. `supabase/migrations/` exists but contains no schema migrations. The eight-table schema below is the reviewed design target, not a deployed database.

## 4. Authentication approach

- Supabase Auth owns sign-up, sign-in, session tokens and password/account recovery flows.
- The browser only receives the publishable/anonymous key; the service-role key must never be present in frontend code or `VITE_` variables.
- A `profiles` row is planned for each authenticated user, linked to `auth.users.id`.
- Authentication screens and session handling are future-phase work.
- **Subject to review:** exact sign-up method (email/password, OTP, or both), collector/aggregator/recycler onboarding approval and admin invitation flow.

## 5. Role-based authorization

The four application roles are:

- `consumer`
- `collector` (Local Kabadiwala)
- `aggregator` (Large Kabadiwala / Aggregator)
- `recycler` (Authorized Recycler role terminology; actual authorization status must be stored and verified separately)

Frontend role checks will only shape navigation and visible actions. They are never the security boundary. Every private read and write is enforced by PostgreSQL RLS and protected functions. A user's role is derived from the server-side `profiles` record, not from a client-supplied claim that can be edited freely.

**Subject to review:** who may assign or change a role, how recycler verification evidence is recorded, and whether role changes require an admin audit table.

## 6. RLS security approach

Planned rules:

- RLS is enabled on every private table before any non-admin data is exposed.
- Users can read and write only records they own or records explicitly assigned to them.
- Consumers see their own listings, transactions and receipts.
- Collectors see available pickup requests plus requests assigned to themselves.
- Aggregators see lots assigned to them and related offers.
- Recyclers see offers addressed to them and their own facility profile.
- Category and indicative-rate tables are readable by signed-in users and writable only by administrators.
- Public QR verification uses a narrow, read-only channel such as a `SECURITY DEFINER` function or a restricted view that exposes only non-sensitive fields.
- Critical transitions and duplicate pickup acceptance are protected server-side.

No production RLS policies were created in Phase 0 because the schema has not yet been reviewed and implemented. Placeholder or unsafe policies were deliberately avoided.

## 7. Material listing workflow

1. A consumer signs in and selects a category and subcategory from administrator-maintained options.
2. The consumer enters approximate weight, condition, pickup location/zone and preferred pickup time.
3. A reference photograph may be uploaded to private Storage; it is optional.
4. The application retrieves the indicative rate for the selected category/subcategory and shows `Estimated Value = Approximate Weight × Indicative Rate`.
5. The listing moves from `LISTED` to `PICKUP_REQUESTED` when the consumer submits the pickup request.

Manual categorization is mandatory in the MVP. AI image classification and live price prediction are out of scope. Demonstration rates are illustrative and must be labelled as such.

## 8. Collector workflow

1. The collector views available pickup requests, filtered by area/zone and material category.
2. The collector accepts or rejects an eligible request. Acceptance must be atomic so two collectors cannot accept the same request.
3. The collector records actual collected weight and confirms collection.
4. A structured material lot is created with a unique lot code.
5. The collector sees collection history and an earnings ledger derived from persisted records.

**Subject to review:** the exact zone-matching rule, rejection reasons and whether a rejected request returns to the public pool.

## 9. Aggregator workflow

1. Assigned material lots appear in the aggregator inventory with weights, categories and source traceability.
2. Compatible lots may be consolidated while preserving source history.
3. The aggregator browses recycler profiles, accepted categories and published buying rates.
4. The aggregator submits an offer to a recycler and tracks acceptance or rejection.
5. After handover, the aggregator sees sales history and earnings records.

**Subject to review:** whether consolidation requires an additional link table beyond the eight core tables. Traceability must not be lost if it does.

## 10. Recycler workflow

1. A recycler maintains a facility profile, accepted material categories and buying rates.
2. The platform must distinguish the role label from verified legal authorization status. No facility is presented as legally authorized unless verification has been recorded.
3. The recycler reviews incoming offers and accepts or rejects them.
4. After physical receipt, the recycler confirms handover and records final received weight.
5. The recycler updates payment status independently of handover completion.

## 11. Transaction lifecycle

Material statuses, in order:

```text
LISTED
PICKUP_REQUESTED
ACCEPTED
COLLECTED
IN_AGGREGATOR_INVENTORY
OFFERED_TO_RECYCLER
ACCEPTED_BY_RECYCLER
HANDOVER_CONFIRMED
COMPLETED
```

Payment status is separate:

```text
PENDING
PAID
```

A handover confirmation must never set `PAID` automatically. Status transitions are validated server-side and historical records are preserved rather than overwritten.

**Subject to review:** whether `COMPLETED` is triggered by handover confirmation plus both-party acknowledgement, or by an explicit aggregator action. The independent payment status is not subject to review.

## 12. QR verification architecture

- Each confirmed handover has a unique lot ID, transaction reference and verification token.
- A QR code encodes a public verification URL containing the transaction reference or token.
- The public page is read-only.
- Allowed public fields are limited to non-sensitive transaction metadata such as lot reference, material category/subcategory, verified weight, city/zone, handover status, recycler confirmation, timestamp and payment status.
- The public page must not expose consumer names, phone numbers, full street addresses, authentication data or private account information.
- QR receipt copy states that it is a digital transaction record and does not independently establish legal or regulatory compliance.

The QR generation library is **subject to review**; `qrcode.react` is the intended client-side candidate. No QR implementation is present in Phase 0.

## 13. Storage architecture

- Planned private Supabase Storage bucket for optional scrap reference photographs, provisionally named `scrap-photos` (**subject to review**).
- File paths are linked to `scrap_listings` or `material_lots`; access is governed by Storage policies aligned with RLS.
- Public QR receipts do not expose private photograph URLs or original files.
- No bucket or Storage policy was created in Phase 0.

## 14. Deployment architecture

- Target: Cloudflare Pages, subject to free-plan suitability and current plan limits.
- Build command: `npm run build`.
- Output directory: `dist`.
- Browser-safe environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`.
- No service-role key is used in the frontend build environment.
- No deployment was performed in Phase 0 and no Cloudflare account was accessed.

## 15. Security boundaries

| Boundary | Rule |
| --- | --- |
| Browser | Holds only publishable/anonymous credentials; never a service-role key. Role checks are cosmetic only. |
| Supabase Auth | Owns identity and session validity. |
| PostgreSQL | Owns record ownership, status transitions, uniqueness and RLS. |
| Storage | Private by default; policies mirror record ownership. |
| Public QR | Narrow read-only fields, no personal data, no authentication data. |
| Documentation | Illustrative prices are labelled as examples; no regulatory claim is made from a QR receipt. |

## 16. Proposed core tables

These eight tables are the documented MVP target. Exact column names and constraints are **subject to backend review** before migrations are written.

| Table | Purpose | Important relationships and ownership |
| --- | --- | --- |
| `profiles` | User identities and role assignments. | `id` references `auth.users.id`; columns for role, full name, phone and city. Each row is owned by its user. |
| `material_categories` | Manual category and subcategory catalogue. | Administrator-managed; referenced by listings and lots. |
| `price_rates` | Administrator-maintained indicative rates. | `category_id` references `material_categories`; includes rate per kg, unit and update timestamp. Not writable by ordinary users. |
| `scrap_listings` | Consumer listings and pickup requests. | `consumer_id` references `profiles`; optional `collector_id`; `category_id` references `material_categories`; stores estimated/actual weight, condition, pickup details, optional photo path and status. Owned by the consumer; assigned collector may read/update. |
| `material_lots` | Structured lots created after collection. | Unique `lot_code`; references collector, aggregator and category; stores weight and lot status. May reference source listings directly or through a future lineage table. |
| `recyclers` | Facility profiles and accepted categories. | `profile_id` references `profiles`; stores facility name, location, accepted categories and verification status. Public data is limited. |
| `transactions` | Offers, rates, lifecycle and payment status. | Unique `tx_reference`; `lot_id` references `material_lots`; `recycler_id` references `recyclers`; stores offered rate, final value, transaction status and independent payment status. |
| `handover_records` | Digital custody confirmation and QR token. | `transaction_id` references `transactions`; unique QR token/verification reference; stores handover timestamp, recycler confirmation and received weight. Public query is restricted to approved fields. |

## 17. Future extension points

- Route-level screens and protected layouts.
- Database migrations and RLS policies for the eight tables.
- Server-side transition validation and atomic pickup acceptance.
- Four dashboards sharing one design system and one navigation shell.
- QR receipt generation and public verification route.
- Optional Hindi/multilingual support, offline-first sync and GPS verification as post-MVP roadmap items.
- Hosting review for Cloudflare Pages free-plan limits.


## 18. Phase 5 implementation note

Implemented locally through migration `20261124000600_phase5_aggregator_inventory_and_offers.sql`:

- `material_lots` now carries `source_listing_id` (unique), `subcategory_id` and
  `IN_AGGREGATOR_INVENTORY` status. A database trigger creates the lot when a collection is
  completed; the browser cannot create or edit lots.
- Aggregators see unassigned intake and claim it atomically. `transactions` records one live
  `OFFERED_TO_RECYCLER` offer per lot; withdrawal is a recorded transition.
- Recyclers maintain a facility profile whose verification status is administrator-controlled.
- The `scrap-listings` Storage bucket is private and served through signed URLs.
- Recycler acceptance, handover, final weight, payment and the QR page remain Phase 6. See
  `docs/PHASE_5_REPORT.md`.
