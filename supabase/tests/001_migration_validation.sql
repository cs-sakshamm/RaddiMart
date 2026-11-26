-- RADDIMART — Local Supabase Migration Validation Tests
--
-- Run against a clean local Supabase instance after applying migrations 001→003.
-- Usage:
--   supabase start
--   supabase migration up
--   psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/001_migration_validation.sql
--
-- These tests are read-only and never modify data. They are safe to run locally
-- and must NEVER be run against the production Supabase project.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. All expected tables exist after migrations 001→003
-- ============================================================
SELECT
  'tables_exist' AS test,
  COUNT(*) AS expected_count,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'profiles', 'material_categories', 'price_rates',
       'recyclers', 'role_requests', 'material_lots',
       'transactions', 'handover_records', 'scrap_listings'
     )) AS actual_count
WHERE
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN (
       'profiles', 'material_categories', 'price_rates',
       'recyclers', 'role_requests', 'material_lots',
       'transactions', 'handover_records', 'scrap_listings'
     )) = 9;

-- ============================================================
-- 2. RLS is enabled on all user-facing tables
-- ============================================================
SELECT
  'rls_enabled' AS test,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'material_categories', 'price_rates',
    'recyclers', 'role_requests', 'material_lots',
    'transactions', 'handover_records', 'scrap_listings'
  )
ORDER BY tablename;

-- ============================================================
-- 3. approve_role_request function exists with expected signature
-- ============================================================
SELECT
  'function_signature' AS test,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_role_request';

-- ============================================================
-- 4. handle_profiles_update trigger function exists
-- ============================================================
SELECT
  'trigger_function_exists' AS test,
  n.nspname AS schema_name,
  p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'handle_profiles_update';

-- ============================================================
-- 5. profiles_update_trigger exists on profiles table
-- ============================================================
SELECT
  'trigger_exists' AS test,
  tgname AS trigger_name,
  tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass
  AND tgname = 'profiles_update_trigger';

-- ============================================================
-- 6. Partial unique index for role request deduplication exists
-- ============================================================
SELECT
  'dedup_index_exists' AS test,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_role_requests_one_pending_per_user_role';

-- ============================================================
-- 7. Role identifier mapping comment is documented
-- ============================================================
SELECT
  'role_mapping_comment' AS test,
  objdescription('scrap_listings'::regclass, 'pg_class') AS comment;

-- ============================================================
-- 8. Critical indexes exist
-- ============================================================
SELECT
  'critical_indexes' AS test,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_profiles_active_role',
    'idx_profiles_is_admin',
    'idx_role_requests_user',
    'idx_role_requests_status',
    'idx_transactions_lot',
    'idx_transactions_recycler',
    'idx_handover_records_transaction',
    'idx_handover_records_qr',
    'idx_material_lots_collector',
    'idx_material_lots_aggregator',
    'idx_material_lots_category',
    'idx_material_lots_lot_code',
    'idx_material_lots_status',
    'idx_scrap_listings_consumer',
    'idx_scrap_listings_collector',
    'idx_scrap_listings_category',
    'idx_scrap_listings_status'
  )
ORDER BY indexname;

-- ============================================================
-- 9. Profiles table has active_role and is_admin columns
-- ============================================================
SELECT
  'profiles_columns' AS test,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('id', 'full_name', 'phone', 'active_role', 'is_admin', 'created_at', 'updated_at')
ORDER BY ordinal_position;

-- ============================================================
-- 10. role_requests CHECK constraints
-- ============================================================
SELECT
  'role_requests_constraints' AS test,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'role_requests'::regclass
  AND contype = 'c';
