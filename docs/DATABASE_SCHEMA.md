# RADDIMART — Phase 2 Database Schema

This document defines the database schema for RADDIMART Phase 2, implemented through Supabase PostgreSQL migrations.

## Tables

### 1. profiles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, FK → auth.users(id) ON DELETE CASCADE | Linked to Supabase auth user ID |
| full_name | TEXT | Nullable | User's full name |
| phone | TEXT | Nullable | User's phone number |
| active_role | TEXT | DEFAULT 'consumer', CHECK (IN ('consumer', 'collector', 'aggregator', 'recycler')) | User's current active role |
| is_admin | BOOLEAN | DEFAULT FALSE, NOT NULL | Administrative privilege flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

### 2. material_categories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Category ID |
| name | TEXT | NOT NULL | Category name (e.g., "Metal scrap", "E-waste") |
| parent_id | UUID | FK → material_categories(id), NULL allowed | For subcategories |
| is_subcategory | BOOLEAN | DEFAULT FALSE | Whether this is a subcategory |
| description | TEXT | Nullable | Optional description |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

### 3. price_rates

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Rate ID |
| category_id | UUID | FK → material_categories(id) ON DELETE SET NULL | Referenced category |
| rate_per_kg | NUMERIC(10,2) | NOT NULL | Rate per kilogram |
| unit | TEXT | DEFAULT 'kg' | Unit of measurement |
| is_active | BOOLEAN | DEFAULT TRUE | Whether this rate is active |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

### 4. role_requests

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Request ID |
| user_id | UUID | FK → profiles(id) ON DELETE CASCADE | Requesting user |
| requested_role | TEXT | NOT NULL, CHECK (IN ('local_collector', 'aggregator', 'recycler')) | Requested stakeholder role |
| applicant_name | TEXT | Nullable | Applicant's name |
| organization_name | TEXT | Nullable | Business/organization name |
| phone | TEXT | Nullable | Contact phone |
| city_or_operating_area | TEXT | Nullable | City or operating area |
| description | TEXT | Nullable | Optional description |
| status | TEXT | DEFAULT 'pending', CHECK (IN ('pending', 'approved', 'rejected')) | Request status |
| reviewed_by | UUID | FK → profiles(id), Nullable | Administrator who reviewed |
| reviewed_at | TIMESTAMPTZ | Nullable | Review timestamp |
| review_note | TEXT | Nullable | Administrator's review note |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

**Index**: `idx_role_requests_one_pending_per_user_role` — partial unique index on `public.role_requests (user_id, requested_role) WHERE status = 'pending'`, preventing duplicate pending requests for the same user and requested_role.

**Role identifier mapping**:
- `profiles.active_role`: `'consumer'`, `'collector'`, `'aggregator'`, `'recycler'` — the user's current active role, stored in the profile.
- `role_requests.requested_role`: `'local_collector'`, `'aggregator'`, `'recycler'` — the role the user is requesting access to.
- Mapping in `approve_role_request()`: `local_collector` → `collector`, `aggregator` → `aggregator`, `recycler` → `recycler`. Requests with `local_collector` map to the `collector` active role in the profile.

### 5. recyclers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Recycler ID |
| profile_id | UUID | UNIQUE, FK → profiles(id) ON DELETE CASCADE | Linked profile |
| facility_name | TEXT | NOT NULL | Recycler facility name |
| location | TEXT | Nullable | Facility location |
| accepted_categories | TEXT[] | JSON array of category names/IDs | Accepted material categories |
| verification_status | TEXT | DEFAULT 'pending', CHECK (IN ('pending', 'verified', 'rejected')) | Verification status |
| contact_email | TEXT | Nullable | Contact email address |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

### 6. transactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Transaction ID |
| tx_reference | UUID | UNIQUE, DEFAULT uuid_generate_v4() | Unique transaction reference |
| lot_id | UUID | FK → material_lots(id) ON DELETE SET NULL | Associated material lot |
| recycler_id | UUID | FK → recyclers(id) ON DELETE SET NULL | Associated recycler |
| offered_rate | NUMERIC(10,2) | Nullable | Offered rate per kg |
| final_value | NUMERIC(12,2) | Nullable | Final transaction value |
| status | TEXT | DEFAULT 'LISTED', CHECK (IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED', 'IN_AGGREGATOR_INVENTORY', 'OFFERED_TO_RECYCLER', 'ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED')) | Transaction status |
| payment_status | TEXT | DEFAULT 'PENDING', CHECK (IN ('PENDING', 'PAID')) | Independent payment status |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

**Key constraint**: payment_status is independent of status — a COMPLETED handover does not automatically set PAID.

### 7. handover_records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Handover record ID |
| transaction_id | UUID | UNIQUE, FK → transactions(id) ON DELETE CASCADE | Associated transaction |
| qr_token | UUID | UNIQUE, DEFAULT uuid_generate_v4() | QR verification token |
| handover_timestamp | TIMESTAMPTZ | DEFAULT NOW() | Handover timestamp |
| recycler_confirmation | BOOLEAN | DEFAULT FALSE | Recycler confirmation flag |
| received_weight | NUMERIC(10,2) | Nullable | Weight received at handover |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

### 8. material_lots

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Lot ID |
| lot_code | UUID | UNIQUE, DEFAULT uuid_generate_v4() | Unique lot code |
| collector_id | UUID | FK → profiles(id) ON DELETE SET NULL | Collecting collector |
| aggregator_id | UUID | FK → profiles(id) ON DELETE SET NULL | Assigned aggregator |
| category_id | UUID | FK → material_categories(id) ON DELETE SET NULL | Material category |
| source_listing_id | UUID | FK → scrap_listings(id) ON DELETE SET NULL | Source scrap listing |
| approximate_weight | NUMERIC(10,2) | Nullable | Approximate weight at listing |
| actual_weight | NUMERIC(10,2) | Nullable | Actual collected weight |
| condition | TEXT | Nullable | Material condition description |
| pickup_location | TEXT | Nullable | Pickup location |
| pickup_zone | TEXT | Nullable | Pickup zone/area |
| requested_pickup_time | TIMESTAMPTZ | Nullable | Requested pickup time |
| status | TEXT | DEFAULT 'LISTED', CHECK (IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED', 'IN_AGGREGATOR_INVENTORY')) | Lot status |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Row creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Row last-update timestamp |

## Indexes

Critical indexes for performance and RLS:

- `idx_profiles_active_role` ON profiles(active_role)
- `idx_profiles_is_admin` ON profiles(is_admin)
- `idx_material_categories_parent` ON material_categories(parent_id)
- `idx_price_rates_category` ON price_rates(category_id)
- `idx_recyclers_profile` ON recyclers(profile_id)
- `idx_role_requests_user` ON role_requests(user_id)
- `idx_role_requests_status` ON role_requests(status)
- `idx_transactions_lot` ON transactions(lot_id)
- `idx_transactions_recycler` ON transactions(recycler_id)
- `idx_handover_records_transaction` ON handover_records(transaction_id)
- `idx_handover_records_qr` ON handover_records(qr_token)
- `idx_material_lots_collector` ON material_lots(collector_id)
- `idx_material_lots_aggregator` ON material_lots(aggregator_id)
- `idx_material_lots_category` ON material_lots(category_id)
- `idx_material_lots_lot_code` ON material_lots(lot_code)
- `idx_material_lots_status` ON material_lots(status)
- `idx_scrap_listings_consumer` ON scrap_listings(consumer_id)
- `idx_scrap_listings_collector` ON scrap_listings(collector_id)
- `idx_scrap_listings_category` ON scrap_listings(category_id)
- `idx_scrap_listings_status` ON scrap_listings(status)

## Row Level Security (RLS) Policies

### profiles

- **SELECT**: Authenticated users can read own profile (WHERE auth.uid() = id)
- **INSERT**: Service role only (profile created via trigger on auth.users)
- **UPDATE**: Authenticated users can update own profile (full_name, phone). The `profiles_update_trigger` BEFORE UPDATE trigger prevents non-admin users from changing `active_role` or `is_admin`; those fields revert to their previous values if modified by a non-admin. Admin users can change these fields freely.
- **Admins**: Can read/update all profiles

### material_categories

- **SELECT**: All authenticated users
- **INSERT/UPDATE/DELETE**: Administrators only (WHERE EXISTS profiles WHERE id = auth.uid() AND is_admin = TRUE)

### price_rates

- **SELECT**: All authenticated users (WHERE is_active = true)
- **INSERT/UPDATE/DELETE**: Administrators only

### role_requests

- **INSERT**: Authenticated users, WHERE auth.uid() = user_id
- **SELECT**: Users can read own requests (WHERE auth.uid() = user_id); admins can read all
- **UPDATE**: Users cannot approve/reject own requests; admins can update status and review fields
- **DELETE**: Not permitted

### recyclers

- **SELECT**: All authenticated users
- **INSERT/UPDATE/DELETE**: Administrators only

### transactions

- **SELECT**: Users can read own transactions (via lot ownership or recycler role); admins can read all
- **INSERT**: Authenticated users (consumer-created listings)
- **UPDATE**: Administrators only

### handover_records

- **SELECT**: Users can read handover records related to their transactions; admins can read all
- **INSERT/UPDATE/DELETE**: Administrators only

### material_lots

- **SELECT**: Users can read lots they created or are assigned to; specific read rules per role
- **INSERT**: Consumers (via scrap listings); collectors (after acceptance)
- **UPDATE**: Role-specific; administrators have full access

## Database Functions

### approve_role_request(p_request_id UUID, p_status TEXT, p_review_note TEXT)

- **Language**: plpgsql
- **Security**: SECURITY DEFINER, SET search_path = public
- **Purpose**: Secure admin approval/rejection of role requests
- **Validates**:
  - Status is 'approved' or 'rejected'
  - Request exists
  - Caller is an administrator (profiles.is_admin = TRUE)
  - Requested role is valid (local_collector, aggregator, recycler)
  - Prevents user from approving own request
- **Updates**:
  - Request status, reviewed_by, reviewed_at, review_note
  - If approved: updates user's active_role in profiles (maps: local_collector→collector, aggregator→aggregator, recycler→recycler)
  - If rejected: user's role stays unchanged
- **Returns**: VOID

## Admin Bootstrap

To initialize the first administrator:

```sql
-- 1. Identify the user who should be admin (by Supabase auth user ID)
-- 2. Execute:
UPDATE profiles SET is_admin = TRUE WHERE id = '<auth-user-id>';

-- 3. The admin can now use the approve_role_request() function
-- 4. To approve a request:
SELECT approve_role_request('<request-id>', 'approved', 'Approved via admin review');
```

## Safety Practices

- No service-role key in frontend code or VITE_ environment variables
- All privileged operations enforced through RLS and protected database functions
- Users cannot modify is_admin or active_role through browser state
- Role changes occur only through trusted database-side logic
- Audit trail via reviewed_by, reviewed_at, and review_note fields

---

# Phase 3/4 additions (migrations 20261124000400 and 20261124000500)

## Migration naming

The Phase 2 files were named `20261124_001_…`, `20261124_002_…`, `20261124_003_…`. The
Supabase CLI takes the version from everything before the first underscore, so all three
resolved to version `20261124` and the second file failed with
`duplicate key value violates unique constraint "schema_migrations_pkey"`. They were renamed
to unique 14-digit timestamps (`20261124000100`, `20261124000200`, `20261124000300`) with
identical content and order. No remote project had any migration recorded at the time, so
no applied migration was changed.

## scrap_listings changes

| Change | Detail |
|--------|--------|
| `subcategory_id` | UUID, FK → material_categories(id) ON DELETE SET NULL. The listing keeps `category_id` = parent category and `subcategory_id` = child. |
| `status` CHECK | Extended with `CANCELLED`: `LISTED`, `PICKUP_REQUESTED`, `ACCEPTED`, `COLLECTED`, `CANCELLED`. |
| `pickup_location` | **Removed.** Replaced by `scrap_listing_addresses` so the full address can be hidden from collectors until a pickup is accepted. |
| RLS | Enabled (it had never been enabled). |
| Trigger | `scrap_listings_rules` enforces ownership, status transitions and column ownership. |

### scrap_listing_addresses (new)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| listing_id | UUID | PRIMARY KEY, FK → scrap_listings(id) ON DELETE CASCADE | One address per listing |
| address | TEXT | NOT NULL | Consumer's full pickup address |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT NOW() | Timestamps |

## scrap_listings RLS policies

| Policy | Command | Rule |
|--------|---------|------|
| Consumers can read own listings | SELECT | `consumer_id = auth.uid()` |
| Collectors can read eligible listings | SELECT | `current_active_role() = 'collector'` AND (`status IN ('LISTED','PICKUP_REQUESTED')` OR `collector_id = auth.uid()`) |
| Admins can read all listings | SELECT | `is_admin()` |
| Consumers can create own listings | INSERT | `consumer_id = auth.uid()`, no collector, open status |
| Consumers can update own unclaimed listings | UPDATE | `consumer_id = auth.uid()` and `collector_id IS NULL` |
| Collectors can claim available listings | UPDATE | unclaimed + open → `collector_id = auth.uid()`, `status = 'ACCEPTED'` |
| Collectors can update own pickups | UPDATE | `collector_id = auth.uid()` |
| Collectors can release own pickups | UPDATE | own pickup → `collector_id IS NULL`, open status |
| Admins can manage all listings | ALL | `is_admin()` |

`scrap_listing_addresses` is readable only by the listing owner, the assigned collector
(and only after assignment) or an administrator.

## Status transitions enforced by `scrap_listings_rules`

```text
LISTED            → PICKUP_REQUESTED | ACCEPTED | CANCELLED
PICKUP_REQUESTED  → LISTED | ACCEPTED | CANCELLED
ACCEPTED          → COLLECTED | PICKUP_REQUESTED | LISTED   (release)
COLLECTED         → (terminal)
CANCELLED         → (terminal)
```

Any other transition raises an exception. Consumers cannot write `collector_id` or
`actual_weight`; the assigned collector cannot change the material terms, zone, preferred
time, photo or address.

## Helper functions

### is_admin() / current_active_role()

`STABLE SECURITY DEFINER` lookups of the caller's profile. They exist because a policy on
`profiles` that queries `profiles` raises `infinite recursion detected in policy for relation
"profiles"`, which made every cross-profile read fail. All policies that previously used a
`profiles` subquery now call these helpers.

### handle_new_user()

`AFTER INSERT ON auth.users` trigger creating the `profiles` row with `active_role =
'consumer'`. Phase 2 documentation described this trigger but it had never been created, so
new accounts had no profile. Migration 004 also backfills profiles for existing auth users.

### ensure_own_profile()

`SECURITY DEFINER`, authenticated-only function with no arguments. It returns the caller's own
`profiles` row, creating it with `active_role = 'consumer'` only when it is genuinely absent.
The caller comes from `auth.uid()` (JWT), not a parameter, so the function cannot target another
account or grant a privileged role. It is idempotent and is used by the frontend as a safe
self-repair path for accounts created before the trigger existed.

### public.uuid_generate_v4() compatibility shim

Some Supabase projects install `uuid-ossp` in the `extensions` schema instead of `public`.
Migration `20261124000250` creates a `public.uuid_generate_v4()` wrapper backed by PostgreSQL's
built-in `gen_random_uuid()` only when no public function exists. It has no effect on projects
where the extension already installed the function in `public`.

### handle_profiles_update() (replaced)

The Phase 2 version checked the **target** profile's `is_admin` flag instead of the caller's,
so it reverted every role change for anyone who was not already an administrator — including
the write performed by `approve_role_request()`, which silently meant approved requests never
changed the user's role. It now compares the caller (via `auth.uid()` / `is_admin()`) and
raises on a forbidden change instead of silently reverting it. Trusted server contexts
(`auth.uid() IS NULL`, i.e. SQL as the database owner or `service_role`) may set roles.

## Storage

Bucket `scrap-listings` (public read, 5 MB limit, `image/jpeg`, `image/png`,
`image/webp`). Only the owning user can insert/update/delete objects under
`listings/<auth.uid()>/`.

---

# Phase 5 additions (migration 20261124000600)

## material_lots

| Change | Detail |
|--------|--------|
| `subcategory_id` | UUID, FK → material_categories ON DELETE SET NULL |
| `source_listing_id` | UUID, FK → scrap_listings ON DELETE SET NULL, UNIQUE (one lot per collection) |
| `status` | CHECK extended with `IN_AGGREGATOR_INVENTORY` |
| `aggregator_id` | NULL = available intake; set atomically by one aggregator |

Lots are created by `create_lot_on_collection()` after a listing becomes `COLLECTED`. The lot
carries collector, category, subcategory, weights, condition, zone and preferred time — **not**
the consumer's street address.

## transactions

| Change | Detail |
|--------|--------|
| `status` | CHECK extended with `WITHDRAWN` |
| Live-offer index | `UNIQUE (lot_id) WHERE status = 'OFFERED_TO_RECYCLER'` |

Offers start as `OFFERED_TO_RECYCLER` with `payment_status = 'PENDING'`. A non-admin aggregator
may only withdraw the offer; the row remains for history. `final_value` stays NULL until a later
handover phase.

## Triggers and helpers

- `create_lot_on_collection` — AFTER UPDATE on `scrap_listings`.
- `enforce_material_lot_rules` — claim-only updates for aggregators; all other fields immutable.
- `enforce_transaction_rules` — offer creation and withdrawal rules; payment protection.
- `enforce_recycler_rules` — verification status and facility ownership cannot be self-changed.
- `is_lot_aggregator(uuid)`, `is_offer_recycler(uuid)`, `recycler_has_lot_offer(uuid)` —
  `SECURITY DEFINER`, `STABLE`, granted to `authenticated`.

## RLS summary

| Table | Aggregator | Recycler | Consumer |
|-------|------------|----------|----------|
| `material_lots` | unassigned intake + own lots; claim unassigned | lots that have an offer to their facility | no access |
| `transactions` | offers for own lots; insert/withdraw | offers addressed to their facility | no access |
| `recyclers` | read directory | insert/update own row (verification locked) | read directory |

The Phase 2 policies that allowed any authenticated user to read or insert any transaction were
replaced. `supabase/tests/003_phase5_rls_validation.sql` verifies the table above.

## Storage

The `scrap-listings` bucket is private (`public = false`). Signed-in users may create short-lived
signed URLs; anonymous requests and permanent public URLs cannot read objects. Uploads remain
owner-folder only.
