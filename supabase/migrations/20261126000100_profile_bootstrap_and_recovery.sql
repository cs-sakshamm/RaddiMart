-- Profile bootstrap and safe self-repair
--
-- Why this migration exists
-- -------------------------
-- The production project was found to be missing every migration from Phase 3
-- onward: `scrap_listings`/`scrap_listing_addresses` and the Phase 3 helper
-- functions `public.is_admin()` / `public.current_active_role()` do not exist
-- there. The `handle_new_user()` trigger is defined in
-- 20261124000400_phase3_rls_and_collector_marketplace.sql, so on that project a
-- signup created an `auth.users` row but never a `profiles` row. Sign-in then
-- worked (GoTrue is independent of the public schema) while every profile read
-- returned no row, which the dashboard reported as "Profile not found."
--
-- What this migration does (all additive and idempotent)
-- -----------------------------------------------------
--   1. Restores the standard PostgREST privileges for the `authenticated` role
--      on RLS-enabled tables. The affected project answers 42501 "permission
--      denied" for these grants, so even an existing profile would be
--      unreadable. RLS remains the security boundary: no policy is changed,
--      nothing is granted to `anon`, and no RLS-disabled table is touched.
--   2. Re-asserts `handle_new_user()` and its auth.users trigger so future
--      signups always get a profile (same definition as migration 004).
--   3. Backfills a profile for every existing auth user that has none, which
--      repairs accounts created while the trigger was absent. Existing profile
--      rows are never modified.
--   4. Adds `public.ensure_own_profile()`, a SECURITY DEFINER function the app
--      can call when a signed-in user's row is genuinely absent. It takes no
--      parameters, can only ever touch `auth.uid()`, always assigns the default
--      'consumer' role, and does nothing when a row already exists. It cannot be
--      used to create or read another user's profile and cannot grant a role.

-- ============================================================
-- 1. RESTORE TABLE PRIVILEGES FOR SIGNED-IN USERS
-- ============================================================
-- Only tables with RLS enabled are touched, so a grant can never expose an
-- unprotected table. Policies from migrations 002/003/005/006 still decide every
-- row-level read and write.

DO $$
DECLARE
  tbl RECORD;
BEGIN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';

  FOR tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl.relname
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 2. PROFILE AUTO-CREATION FOR NEW AUTH USERS
-- ============================================================
-- Identical in behaviour to the definition in migration 004. Re-asserted here
-- because that migration was never applied to the affected project.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, active_role)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    'consumer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. BACKFILL PROFILES FOR EXISTING AUTH USERS
-- ============================================================
-- Repairs every account created while the trigger was missing (including the
-- reported one). Existing rows and their roles are preserved.

INSERT INTO public.profiles (id, full_name, phone, active_role)
SELECT
  u.id,
  NULLIF(u.raw_user_meta_data->>'full_name', ''),
  NULLIF(u.raw_user_meta_data->>'phone', ''),
  'consumer'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. SAFE SELF-REPAIR FOR A SIGNED-IN USER
-- ============================================================
-- The browser may ask the database to create its own missing profile. The
-- caller is taken from the JWT (auth.uid()), never from an argument, so this
-- cannot touch another account. The default role is fixed: a user cannot ask
-- for collector, aggregator, recycler or administrator here.

CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, active_role)
  SELECT
    u.id,
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'phone', ''),
    'consumer'
  FROM auth.users u
  WHERE u.id = v_uid
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile could not be created';
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;

COMMENT ON FUNCTION public.ensure_own_profile() IS
  'Creates the caller''s own missing profile with the default consumer role. Idempotent, no parameters, authenticated only.';
