-- Phase 4 (security): move the consumer's full pickup address out of the
-- marketplace-readable table.
--
-- scrap_listings rows must be readable by every approved collector while the
-- listing is in the marketplace, and RLS cannot hide a single column. Keeping
-- the full address on that row would therefore expose every consumer's address
-- to any collector before a pickup is accepted. The address now lives in
-- scrap_listing_addresses, which is readable only by the listing owner and the
-- collector assigned to that pickup (or an administrator).

CREATE TABLE IF NOT EXISTS scrap_listing_addresses (
  listing_id UUID PRIMARY KEY REFERENCES scrap_listings(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Preserve any address already recorded on a listing.
INSERT INTO scrap_listing_addresses (listing_id, address)
SELECT id, pickup_location
FROM scrap_listings
WHERE pickup_location IS NOT NULL AND btrim(pickup_location) <> ''
ON CONFLICT (listing_id) DO NOTHING;

ALTER TABLE scrap_listings DROP COLUMN IF EXISTS pickup_location;

ALTER TABLE scrap_listing_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and assigned collectors can read addresses" ON scrap_listing_addresses;
CREATE POLICY "Owners and assigned collectors can read addresses" ON scrap_listing_addresses
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scrap_listings l
      WHERE l.id = scrap_listing_addresses.listing_id
        AND (l.consumer_id = auth.uid() OR l.collector_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Consumers can create addresses for own listings" ON scrap_listing_addresses;
CREATE POLICY "Consumers can create addresses for own listings" ON scrap_listing_addresses
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM scrap_listings l
      WHERE l.id = scrap_listing_addresses.listing_id
        AND l.consumer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Consumers can update addresses for own listings" ON scrap_listing_addresses;
CREATE POLICY "Consumers can update addresses for own listings" ON scrap_listing_addresses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scrap_listings l
      WHERE l.id = scrap_listing_addresses.listing_id
        AND l.consumer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scrap_listings l
      WHERE l.id = scrap_listing_addresses.listing_id
        AND l.consumer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage addresses" ON scrap_listing_addresses;
CREATE POLICY "Admins can manage addresses" ON scrap_listing_addresses
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Recreate the listing guard without the removed column.
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

  IF public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF NEW.consumer_id IS DISTINCT FROM OLD.consumer_id THEN
    RAISE EXCEPTION 'Listing ownership cannot be changed';
  END IF;

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
    NEW.category_id := OLD.category_id;
    NEW.subcategory_id := OLD.subcategory_id;
    NEW.approximate_weight := OLD.approximate_weight;
    NEW.condition := OLD.condition;
    NEW.pickup_zone := OLD.pickup_zone;
    NEW.preferred_pickup_time := OLD.preferred_pickup_time;
    NEW.photo_path := OLD.photo_path;
  ELSE
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
