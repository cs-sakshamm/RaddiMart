-- Phase 3 recovery + Phase 4 collector marketplace support
--
-- Adds only what the existing schema could not express safely:
--   1. RLS helper functions (the profiles policies referenced profiles itself,
--      which raised "infinite recursion detected in policy for relation profiles").
--   2. Profile auto-creation for new auth users (Phase 2 documented a trigger
--      that was never created).
--   3. RLS for scrap_listings and material_lots (RLS was never enabled, so every
--      authenticated user could read and write every listing).
--   4. subcategory_id on scrap_listings so the catalogue hierarchy can be used.
--   5. CANCELLED listing status for consumer cancellation.
--   6. Storage bucket + policies for optional listing photos.
--   7. Status-transition and column-ownership guard for scrap_listings.

-- ============================================================
-- 1. RLS HELPERS
-- ============================================================
-- SECURITY DEFINER so the lookup bypasses the profiles policies it is used by.
-- Without this, any policy that queries profiles re-enters the profiles
-- policies and PostgreSQL aborts with infinite recursion.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.current_active_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT p.active_role FROM public.profiles p WHERE p.id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_active_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_active_role() TO authenticated;

-- ============================================================
-- 2. REPLACE RECURSIVE PROFILES POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can modify categories" ON material_categories;
CREATE POLICY "Only admins can modify categories" ON material_categories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can modify price rates" ON price_rates;
CREATE POLICY "Only admins can modify price rates" ON price_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can review role requests" ON role_requests;
CREATE POLICY "Admins can review role requests" ON role_requests
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can modify transactions" ON transactions;
CREATE POLICY "Admins can modify transactions" ON transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can modify handover records" ON handover_records;
CREATE POLICY "Admins can modify handover records" ON handover_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can modify recyclers" ON recyclers;
CREATE POLICY "Only admins can modify recyclers" ON recyclers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 2b. FIX PROFILE ROLE-GUARD TRIGGER
-- ============================================================
-- The Phase 2 trigger compared the TARGET profile's is_admin flag instead of
-- the CALLER's. As a result it reverted every active_role change for a user who
-- was not already an administrator, which silently broke approve_role_request()
-- for every real applicant. Replaced with a caller-aware guard that raises
-- instead of silently discarding the write.

CREATE OR REPLACE FUNCTION public.handle_profiles_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side contexts (SQL as the database owner, service_role, tests) and
  -- administrators may change roles and the admin flag.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot be changed';
  END IF;

  IF NEW.active_role IS DISTINCT FROM OLD.active_role THEN
    RAISE EXCEPTION 'Users cannot change their own active role';
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Users cannot change the administrator flag';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. PROFILE AUTO-CREATION FOR NEW AUTH USERS
-- ============================================================

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

-- Backfill profiles for accounts created before the trigger existed.
INSERT INTO public.profiles (id, full_name, phone)
SELECT u.id,
       NULLIF(u.raw_user_meta_data->>'full_name', ''),
       NULLIF(u.raw_user_meta_data->>'phone', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ============================================================
-- 4. SCRAP LISTING COLUMNS
-- ============================================================

ALTER TABLE scrap_listings
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES material_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scrap_listings_subcategory ON scrap_listings(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_scrap_listings_zone ON scrap_listings(pickup_zone);

-- CANCELLED lets a consumer withdraw a listing that no collector has claimed.
ALTER TABLE scrap_listings DROP CONSTRAINT IF EXISTS scrap_listings_status_check;
ALTER TABLE scrap_listings ADD CONSTRAINT scrap_listings_status_check
  CHECK (status IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED', 'CANCELLED'));

-- ============================================================
-- 5. SCRAP LISTINGS RLS
-- ============================================================

ALTER TABLE scrap_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consumers can read own listings" ON scrap_listings;
CREATE POLICY "Consumers can read own listings" ON scrap_listings
  FOR SELECT TO authenticated USING (consumer_id = auth.uid());

DROP POLICY IF EXISTS "Collectors can read eligible listings" ON scrap_listings;
CREATE POLICY "Collectors can read eligible listings" ON scrap_listings
  FOR SELECT TO authenticated USING (
    public.current_active_role() = 'collector'
    AND (status IN ('LISTED', 'PICKUP_REQUESTED') OR collector_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can read all listings" ON scrap_listings;
CREATE POLICY "Admins can read all listings" ON scrap_listings
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Consumers can create own listings" ON scrap_listings;
CREATE POLICY "Consumers can create own listings" ON scrap_listings
  FOR INSERT TO authenticated WITH CHECK (
    consumer_id = auth.uid()
    AND collector_id IS NULL
    AND status IN ('LISTED', 'PICKUP_REQUESTED')
  );

DROP POLICY IF EXISTS "Consumers can update own unclaimed listings" ON scrap_listings;
CREATE POLICY "Consumers can update own unclaimed listings" ON scrap_listings
  FOR UPDATE TO authenticated
  USING (consumer_id = auth.uid())
  WITH CHECK (consumer_id = auth.uid() AND collector_id IS NULL);

DROP POLICY IF EXISTS "Collectors can claim available listings" ON scrap_listings;
CREATE POLICY "Collectors can claim available listings" ON scrap_listings
  FOR UPDATE TO authenticated
  USING (
    public.current_active_role() = 'collector'
    AND collector_id IS NULL
    AND status IN ('LISTED', 'PICKUP_REQUESTED')
  )
  WITH CHECK (collector_id = auth.uid() AND status = 'ACCEPTED');

DROP POLICY IF EXISTS "Collectors can update own pickups" ON scrap_listings;
CREATE POLICY "Collectors can update own pickups" ON scrap_listings
  FOR UPDATE TO authenticated
  USING (collector_id = auth.uid() AND public.current_active_role() = 'collector')
  WITH CHECK (collector_id = auth.uid());

DROP POLICY IF EXISTS "Collectors can release own pickups" ON scrap_listings;
CREATE POLICY "Collectors can release own pickups" ON scrap_listings
  FOR UPDATE TO authenticated
  USING (collector_id = auth.uid() AND public.current_active_role() = 'collector')
  WITH CHECK (collector_id IS NULL AND status IN ('LISTED', 'PICKUP_REQUESTED'));

DROP POLICY IF EXISTS "Admins can manage all listings" ON scrap_listings;
CREATE POLICY "Admins can manage all listings" ON scrap_listings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 6. LISTING INTEGRITY GUARD
-- ============================================================
-- Database-level protection, independent of the frontend:
--   * ownership is immutable
--   * consumers cannot write collector-only fields
--   * collectors cannot rewrite the material terms of a listing
--   * only documented status transitions are accepted

CREATE OR REPLACE FUNCTION public.enforce_scrap_listing_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Admins use the admin policies and are not restricted here.
  IF public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- Listing ownership can never be transferred.
  IF NEW.consumer_id IS DISTINCT FROM OLD.consumer_id THEN
    RAISE EXCEPTION 'Listing ownership cannot be changed';
  END IF;

  -- Validate the status transition.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'LISTED' AND NEW.status IN ('PICKUP_REQUESTED', 'ACCEPTED', 'CANCELLED'))
      OR (OLD.status = 'PICKUP_REQUESTED' AND NEW.status IN ('LISTED', 'ACCEPTED', 'CANCELLED'))
      OR (OLD.status = 'ACCEPTED' AND NEW.status IN ('COLLECTED', 'PICKUP_REQUESTED', 'LISTED'))
    ) THEN
      RAISE EXCEPTION 'Invalid listing status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF v_uid = OLD.consumer_id THEN
    -- Consumers own the request details but never the collector fields.
    IF NEW.collector_id IS DISTINCT FROM OLD.collector_id THEN
      RAISE EXCEPTION 'Consumers cannot assign a collector';
    END IF;
    IF NEW.actual_weight IS DISTINCT FROM OLD.actual_weight THEN
      RAISE EXCEPTION 'Consumers cannot record the actual weight';
    END IF;
    IF OLD.status = 'COLLECTED' THEN
      RAISE EXCEPTION 'Collected listings cannot be modified';
    END IF;
  ELSIF v_uid = OLD.collector_id THEN
    -- Assigned collectors may update status/actual weight only.
    NEW.category_id := OLD.category_id;
    NEW.subcategory_id := OLD.subcategory_id;
    NEW.approximate_weight := OLD.approximate_weight;
    NEW.condition := OLD.condition;
    NEW.pickup_location := OLD.pickup_location;
    NEW.pickup_zone := OLD.pickup_zone;
    NEW.preferred_pickup_time := OLD.preferred_pickup_time;
    NEW.photo_path := OLD.photo_path;
  ELSE
    -- Claiming: a collector may only assign the listing to themselves.
    IF NEW.collector_id IS NOT NULL AND NEW.collector_id <> v_uid THEN
      RAISE EXCEPTION 'Collectors cannot assign a listing to another collector';
    END IF;
    IF NEW.actual_weight IS DISTINCT FROM OLD.actual_weight THEN
      RAISE EXCEPTION 'Only the assigned collector can record the actual weight';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scrap_listings_rules ON scrap_listings;
CREATE TRIGGER scrap_listings_rules
  BEFORE UPDATE ON scrap_listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scrap_listing_rules();

-- ============================================================
-- 7. MATERIAL LOTS RLS
-- ============================================================

ALTER TABLE material_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collectors can read own lots" ON material_lots;
CREATE POLICY "Collectors can read own lots" ON material_lots
  FOR SELECT TO authenticated USING (collector_id = auth.uid());

DROP POLICY IF EXISTS "Collectors can create own lots" ON material_lots;
CREATE POLICY "Collectors can create own lots" ON material_lots
  FOR INSERT TO authenticated WITH CHECK (
    collector_id = auth.uid() AND public.current_active_role() = 'collector'
  );

DROP POLICY IF EXISTS "Collectors can update own lots" ON material_lots;
CREATE POLICY "Collectors can update own lots" ON material_lots
  FOR UPDATE TO authenticated
  USING (collector_id = auth.uid())
  WITH CHECK (collector_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage lots" ON material_lots;
CREATE POLICY "Admins can manage lots" ON material_lots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 8. LISTING PHOTO STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scrap-listings',
  'scrap-listings',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Listing photos are publicly readable" ON storage.objects;
CREATE POLICY "Listing photos are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'scrap-listings');

DROP POLICY IF EXISTS "Consumers can upload own listing photos" ON storage.objects;
CREATE POLICY "Consumers can upload own listing photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'scrap-listings'
    AND (storage.foldername(name))[1] = 'listings'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Consumers can update own listing photos" ON storage.objects;
CREATE POLICY "Consumers can update own listing photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'scrap-listings' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'scrap-listings' AND owner = auth.uid());

DROP POLICY IF EXISTS "Consumers can delete own listing photos" ON storage.objects;
CREATE POLICY "Consumers can delete own listing photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'scrap-listings' AND owner = auth.uid());
