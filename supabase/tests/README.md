# RADDIMART — Supabase Local Tests

This directory contains read-only database validation tests for local Supabase development.

## Files

- `001_migration_validation.sql` — Validates that migrations 001→003 applied correctly:
  - All 9 expected tables exist
  - RLS is enabled on all user-facing tables
  - `approve_role_request()` function exists with expected signature
  - `handle_profiles_update()` trigger function exists
  - `profiles_update_trigger` exists on `profiles`
  - Partial unique index for role-request deduplication exists
  - Critical indexes exist
  - Table columns and CHECK constraints are correct

## How to run (local Docker required)

```powershell
# 1. Start local Supabase (Docker Desktop must be running)
npm run supabase:start

# 2. Apply migrations
npm run supabase:migration:up

# 3. Run validation tests against the local database
#    Local DB listens on port 54322 by default (see supabase/config.toml)
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/001_migration_validation.sql

# 4. Stop local Supabase when done
npm run supabase:stop
```

## Safety rules

- These tests are **read-only** and never modify data.
- Run only against a **local** Supabase instance started with `supabase start`.
- **Never** run these against the remote/production Supabase project.
- `supabase db reset` is local-only and must never be run remotely.

## Generating database types

After migrations are applied locally:

```powershell
npm run supabase:gen:types
```

This writes `src/types/database.ts` from the local Supabase schema.
