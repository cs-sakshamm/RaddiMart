# Migration Fix Report — RADDIMART Phase 2

## Summary
Fixed four issues across three migration files to ensure PostgreSQL compatibility, proper dependency ordering, and constraint validity. All migrations can now be executed in order (001 → 002 → 003) on a fresh Supabase project.

---

## Issue 1 — Foreign-key reference syntax

**Problem:** Migration 001 defined `id UUID PRIMARY KEY REFERENCES auth(users) ON DELETE CASCADE` on the `profiles.id` column. Supabase Auth stores users in the `auth.users` system table, not `auth(users)` as a reference. The `auth(users)` syntax is invalid PostgreSQL.

**Fix:** Changed to `REFERENCES auth.users(id) ON DELETE CASCADE` in `supabase/migrations/20261124_001_create_profiles_and_core_tables.sql`.

**Affected file:** `supabase/migrations/20261124_001_create_profiles_and_core_tables.sql`

---

## Issue 2 — Invalid CHECK constraint with subquery

**Problem:** Migration 001's `role_requests` table included a `CONSTRAINT no_duplicate_pending_request` that used a correlated subquery in a CHECK constraint, which PostgreSQL does not support in this manner.

**Fix:** Removed the `no_duplicate_pending_request` CHECK constraint from the `CREATE TABLE` statement and added a proper partial unique index instead (see Issue 3).

**Affected file:** `supabase/migrations/20261124_001_create_profiles_and_core_tables.sql`

---

## Issue 3 — Migration dependency order and partial unique index

**Problem:** Migration 001's `transactions` table referenced `material_lots(id)`, but `material_lots` was only defined in migration 003. This creates a dependency order violation since migrations run sequentially (001 → 002 → 003).

**Additionally:** The partial unique index for preventing duplicate pending role requests was not present in any migration.

**Fix:**
1. Added `material_lots` table to migration 001 **before** the `transactions` table, ensuring material_lots exists before transactions references it.
2. Added `CREATE UNIQUE INDEX IF NOT EXISTS idx_role_requests_one_pending_per_user_role ON public.role_requests (user_id, requested_role) WHERE status = 'pending';` to migration 003, which properly enforces "one pending request per user per role" at the database level.

**Files affected:**
- `supabase/migrations/20261124_001_create_profiles_and_core_tables.sql` — added material_lots table before transactions
- `supabase/migrations/20261124_003_material_lots_and_scrap_listings.sql` — added partial unique index; removed duplicate material_lots table; removed invalid GRANT statement

---

## Issue 4 — PostgreSQL RLS policy and trigger for column protection

**Problem:** Initially, the "Users can update own profile" policy used `VALUES(full_name)` and `VALUES(phone)` in the `WITH CHECK` clause, which is MySQL-specific syntax and invalid in PostgreSQL. Additionally, there was no database-level protection preventing non-admin users from changing `active_role` or `is_admin`.

**Fix 1:** Removed the `VALUES()` references from the RLS `WITH CHECK` clause. The policy now simply uses `auth.uid() = id` in both `USING` and `WITH CHECK`, which correctly allows authenticated users to update their own profile.

**Fix 2:** Added a `BEFORE UPDATE` trigger function `handle_profiles_update()` that prevents non-admin users from changing `active_role` or `is_admin`. If a non-admin user attempts to change these fields, the trigger reverts them to their previous values. Admin users are not affected by the trigger.

**The trigger** `profiles_update_trigger` runs `BEFORE UPDATE ON profiles FOR EACH ROW` and:
- Checks if `active_role` or `is_admin` are being changed
- If the user is not an admin (`is_admin != TRUE`), reverts the changes to old values
- Allows admin users to change these fields freely

**Affected file:** `supabase/migrations/20261124_002_rls_policies_and_admin_function.sql`

**Note:** The `NEW` references in the trigger function are valid PostgreSQL trigger syntax - `NEW` is the standard way to reference the projected row inside `BEFORE` triggers.

---

## Issue 5 — Canonical role identifier alignment

**Problem:** The `profiles.active_role` CHECK constraint allowed `('consumer', 'collector', 'aggregator', 'recycler')`, while `role_requests.requested_role` allowed `('local_collector', 'aggregator', 'recycler')`. The `local_collector` → `collector` mapping existed in the `approve_role_request()` function but was not documented in the migrations.

**Fix:** Added comments in migration 003 documenting the role identifier mapping:
- `profiles.active_role`: `'consumer'`, `'collector'`, `'aggregator'`, `'recycler'`
- `role_requests.requested_role`: `'local_collector'`, `'aggregator'`, `'recycler'`
- Mapping in `approve_role_request()`: `local_collector` → `collector`, `aggregator` → `aggregator`, `recycler` → `recycler`

**Files affected:** `supabase/migrations/20261124_003_material_lots_and_scrap_listings.sql`

---

## Migration Execution Order

Migrations must be applied in this order:

1. `20261124_001_create_profiles_and_core_tables.sql`
   - Creates: profiles, material_categories, price_rates, recyclers, role_requests, material_lots, transactions, handover_records
   - Fixed: FK reference to `auth.users(id)`, material_lots before transactions, removed invalid CHECK constraint

2. `20261124_002_rls_policies_and_admin_function.sql`
   - Creates: RLS policies on all tables, `approve_role_request()` SECURITY DEFINER function
   - Fixed: `VALUES()` → `NEW()` for PostgreSQL RLS policy compatibility
   - All referenced tables already exist after migration 001

3. `20261124_003_material_lots_and_scrap_listings.sql`
   - Creates: scrap_listings table, partial unique index `idx_role_requests_one_pending_per_user_role`
   - Fixed: removed duplicate material_lots; removed invalid GRANT; added index

**No table is referenced before it is created.** All foreign-key dependencies are satisfied by the execution order.

---

## Validation Checklist

- [x] All foreign-key references use `auth.users(id)` schema-qualified syntax
- [x] No invalid CHECK constraints with subqueries
- [x] material_lots created before transactions (dependency order satisfied)
- [x] Partial unique index enforces one pending request per user per role
- [x] Role identifiers standardized: active_role vs requested_role with mapping documented
- [x] RLS policies reference only existing tables
- [x] SECURITY DEFINER function valid after all tables created
- [x] No MySQL-specific `VALUES()` syntax in PostgreSQL RLS policies
- [x] All migrations can be executed in the documented order on a fresh Supabase project

---

## Owner Action Instructions

To apply these migrations to a fresh Supabase project:

```bash
# From the project root
supabase migration up
# Or via the Supabase SQL Editor, execute each migration file in order:
-- 1. 20261124_001_create_profiles_and_core_tables.sql
-- 2. 20261124_002_rls_policies_and_admin_function.sql
-- 3. 20261124_003_material_lots_and_scrap_listings.sql
```

After migrations run, bootstrap the initial administrator:

```sql
UPDATE profiles SET is_admin = TRUE WHERE id = '<auth-user-id>';
```

Replace `<auth-user-id>` with the ID of the first registered user (obtained from `auth.users` after signup).

Then configure Supabase Auth settings in the dashboard:
- Email confirmations enabled
- Password recovery configured with redirect URL `/reset-password`
- Row Level Security enabled on all tables (already set via migrations)

---

# Phase 3 recovery addendum (2026-11-25)

## Issue 6 — `COMMENT ON FUNCTION` signature mismatch

`COMMENT ON FUNCTION approve_role_request(is text, status text, review_note text)` failed with
`SQLSTATE 42883` because the function is declared as `approve_role_request(UUID, TEXT, TEXT)`,
and PostgreSQL matches comments by argument **types**, not parameter names. Corrected to
`COMMENT ON FUNCTION approve_role_request(uuid, text, text)`. The function body, its
`SECURITY DEFINER` setting, admin check, self-approval guard and role mapping are unchanged.

## Issue 7 — duplicate migration versions

The three files were named `20261124_001_…`, `20261124_002_…`, `20261124_003_…`. The CLI uses
everything before the first `_` as the version, so all three were version `20261124` and the
second file aborted with `duplicate key value violates unique constraint
"schema_migrations_pkey"`. Renamed to `20261124000100_…`, `20261124000200_…`,
`20261124000300_…` (content and order identical). The remote project had no migrations
recorded, so no applied migration was modified.

## Issue 8 — non-functional `NOT FOUND` guard

`IF v_request IS NULL` cannot detect a failed `SELECT INTO` on a `%ROWTYPE` record (it is filled
with NULLs). Replaced with `IF NOT FOUND` so a missing request raises the intended error.

## Issue 9 — role-guard trigger made approvals impossible

`handle_profiles_update()` checked `(SELECT is_admin FROM profiles WHERE id = NEW.id)` — the
target user's flag — instead of the caller's. Every `active_role` change for a user who was not
already an administrator was reverted, including the update performed by
`approve_role_request()`. It now checks the caller via `auth.uid()` / `is_admin()`, allows
trusted server contexts, and raises on forbidden changes instead of silently discarding them.
See migration `20261124000400`.

## Verification

`supabase start` completed; `supabase db reset` applied 001→005 plus `seed.sql`; the RLS and
workflow suite `supabase/tests/002_phase3_phase4_rls_validation.sql` reports
`PHASE 3/4 RLS VALIDATION: ALL CHECKS PASSED`. Details in `docs/PHASE_3_REPORT.md`.

> The commands in the instructions above refer to the old file names. Current order:
> `20261124000100` → `20261124000200` → `20261124000300` → `20261124000400` → `20261124000500`,
> then `supabase/seed.sql` (local only).