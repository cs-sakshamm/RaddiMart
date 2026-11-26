-- Phase 5: Aggregator intake and recycler offers
-- Extends the existing listing/lot/transaction model additively.
--
--   COLLECTED ──(automatic lot)──▶ IN_AGGREGATOR_INVENTORY (unassigned)
--   aggregator claims intake ──▶ aggregator_id set
--   aggregator sends offer ──▶ transactions.status = OFFERED_TO_RECYCLER
--   aggregator withdraws ──▶ transactions.status = WITHDRAWN
--
-- Recycler acceptance, handover and QR completion remain Phase 6.
-- No table is duplicated and no existing migration is edited.

-- ============================================================
-- 1. MATERIAL LOTS: traceability columns and status
-- ============================================================

ALTER TABLE material_lots
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES material_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_listing_id UUID REFERENCES scrap_listings(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'material_lots_source_listing_key'
      AND conrelid = 'public.material_lots'::regclass
  ) THEN
    ALTER TABLE material_lots
      ADD CONSTRAINT material_lots_source_listing_key UNIQUE (source_listing_id);
  END IF;
END;
$$;

ALTER TABLE material_lots DROP CONSTRAINT IF EXISTS material_lots_status_check;
ALTER TABLE material_lots
  ADD CONSTRAINT material_lots_status_check
  CHECK (status IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED', 'IN_AGGREGATOR_INVENTORY'));

CREATE INDEX IF NOT EXISTS idx_material_lots_subcategory ON material_lots(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_material_lots_source_listing ON material_lots(source_listing_id);
CREATE INDEX IF NOT EXISTS idx_material_lots_aggregator_status ON material_lots(aggregator_id, status);

-- ============================================================
-- 2. AUTOMATIC LOT RECORD WHEN A COLLECTION IS COMPLETED
-- ============================================================
-- The row is created in the database, not by the browser, so a collection
-- cannot exist without a traceable lot. The consumer's street address is
-- deliberately not copied; only the zone is carried forward.

CREATE OR REPLACE FUNCTION public.create_lot_on_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COLLECTED'
     AND OLD.status IS DISTINCT FROM 'COLLECTED'
     AND NEW.collector_id IS NOT NULL THEN
    INSERT INTO material_lots (
      collector_id,
      category_id,
      subcategory_id,
      source_listing_id,
      approximate_weight,
      actual_weight,
      condition,
      pickup_zone,
      requested_pickup_time,
      status
    )
    VALUES (
      NEW.collector_id,
      NEW.category_id,
      NEW.subcategory_id,
      NEW.id,
      NEW.approximate_weight,
      NEW.actual_weight,
      NEW.condition,
      NEW.pickup_zone,
      NEW.preferred_pickup_time,
      'IN_AGGREGATOR_INVENTORY'
    )
    ON CONFLICT (source_listing_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lot_on_collection() FROM PUBLIC;

DROP TRIGGER IF EXISTS scrap_listings_create_lot ON scrap_listings;
CREATE TRIGGER scrap_listings_create_lot
  AFTER UPDATE ON scrap_listings
  FOR EACH ROW EXECUTE FUNCTION public.create_lot_on_collection();

-- Backfill lots for collections completed before this migration.
INSERT INTO material_lots (
  collector_id, category_id, subcategory_id, source_listing_id,
  approximate_weight, actual_weight, condition, pickup_zone,
  requested_pickup_time, status
)
SELECT
  l.collector_id, l.category_id, l.subcategory_id, l.id,
  l.approximate_weight, l.actual_weight, l.condition, l.pickup_zone,
  l.preferred_pickup_time, 'IN_AGGREGATOR_INVENTORY'
FROM scrap_listings l
WHERE l.status = 'COLLECTED'
  AND l.collector_id IS NOT NULL
ON CONFLICT (source_listing_id) DO NOTHING;

-- ============================================================
-- 3. LOT IMMUTABILITY AND AGGREGATOR CLAIM RULES
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_material_lot_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF public.current_active_role() <> 'aggregator' THEN
    RAISE EXCEPTION 'Only an aggregator can update a material lot';
  END IF;

  IF OLD.aggregator_id IS NOT NULL THEN
    RAISE EXCEPTION 'This lot is already assigned to an aggregator';
  END IF;

  IF NEW.aggregator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'An aggregator can only assign a lot to themselves';
  END IF;

  IF NEW.collector_id IS DISTINCT FROM OLD.collector_id
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.subcategory_id IS DISTINCT FROM OLD.subcategory_id
     OR NEW.source_listing_id IS DISTINCT FROM OLD.source_listing_id
     OR NEW.approximate_weight IS DISTINCT FROM OLD.approximate_weight
     OR NEW.actual_weight IS DISTINCT FROM OLD.actual_weight
     OR NEW.condition IS DISTINCT FROM OLD.condition
     OR NEW.pickup_zone IS DISTINCT FROM OLD.pickup_zone
     OR NEW.requested_pickup_time IS DISTINCT FROM OLD.requested_pickup_time
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only the aggregator assignment may change when claiming a lot';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_material_lot_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS material_lots_rules ON material_lots;
CREATE TRIGGER material_lots_rules
  BEFORE UPDATE ON material_lots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_material_lot_rules();

-- ============================================================
-- 7. HELPER FUNCTIONS (SECURITY DEFINER avoids cross-table recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_lot_aggregator(p_lot_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM material_lots
    WHERE id = p_lot_id AND aggregator_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_offer_recycler(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM transactions t
    JOIN recyclers r ON r.id = t.recycler_id
    WHERE t.id = p_transaction_id AND r.profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.recycler_has_lot_offer(p_lot_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM transactions t
    JOIN recyclers r ON r.id = t.recycler_id
    WHERE t.lot_id = p_lot_id AND r.profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_lot_aggregator(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_offer_recycler(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recycler_has_lot_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lot_aggregator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_offer_recycler(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recycler_has_lot_offer(UUID) TO authenticated;

-- ============================================================
-- 4. LOT RLS
-- ============================================================

DROP POLICY IF EXISTS "Collectors can create own lots" ON material_lots;
DROP POLICY IF EXISTS "Collectors can update own lots" ON material_lots;

DROP POLICY IF EXISTS "Aggregators can read intake and own lots" ON material_lots;
CREATE POLICY "Aggregators can read intake and own lots" ON material_lots
  FOR SELECT TO authenticated USING (
    public.current_active_role() = 'aggregator'
    AND (
      aggregator_id = auth.uid()
      OR (aggregator_id IS NULL AND status = 'IN_AGGREGATOR_INVENTORY')
    )
  );

DROP POLICY IF EXISTS "Recyclers can read offered lots" ON material_lots;
CREATE POLICY "Recyclers can read offered lots" ON material_lots
  FOR SELECT TO authenticated USING (public.recycler_has_lot_offer(id));

DROP POLICY IF EXISTS "Aggregators can claim unassigned lots" ON material_lots;
CREATE POLICY "Aggregators can claim unassigned lots" ON material_lots
  FOR UPDATE TO authenticated
  USING (
    public.current_active_role() = 'aggregator'
    AND aggregator_id IS NULL
    AND status = 'IN_AGGREGATOR_INVENTORY'
  )
  WITH CHECK (
    public.current_active_role() = 'aggregator'
    AND aggregator_id = auth.uid()
  );

-- ============================================================
-- 5. TRANSACTIONS (OFFERS): lifecycle, trigger and RLS
-- ============================================================

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN (
    'LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED',
    'IN_AGGREGATOR_INVENTORY', 'OFFERED_TO_RECYCLER', 'ACCEPTED_BY_RECYCLER',
    'HANDOVER_CONFIRMED', 'COMPLETED', 'WITHDRAWN'
  ));

-- At most one live offer per lot. Withdrawn offers remain as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_live_offer_per_lot
  ON transactions(lot_id)
  WHERE status = 'OFFERED_TO_RECYCLER';

CREATE OR REPLACE FUNCTION public.enforce_transaction_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF public.current_active_role() <> 'aggregator' THEN
    RAISE EXCEPTION 'Only an aggregator can change an offer';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OFFERED_TO_RECYCLER' THEN
      RAISE EXCEPTION 'A new offer must start as OFFERED_TO_RECYCLER';
    END IF;
    IF NOT public.is_lot_aggregator(NEW.lot_id) THEN
      RAISE EXCEPTION 'You can only offer a lot assigned to your inventory';
    END IF;
    IF NEW.offered_rate IS NULL OR NEW.offered_rate <= 0 THEN
      RAISE EXCEPTION 'An offer needs a positive rate per kg';
    END IF;
    IF NEW.payment_status <> 'PENDING' THEN
      RAISE EXCEPTION 'A new offer cannot be marked paid';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF OLD.status <> 'OFFERED_TO_RECYCLER' THEN
    RAISE EXCEPTION 'This offer can no longer be changed';
  END IF;

  IF NEW.status <> 'WITHDRAWN' THEN
    RAISE EXCEPTION 'An aggregator can only withdraw an open offer';
  END IF;

  IF NEW.lot_id IS DISTINCT FROM OLD.lot_id
     OR NEW.recycler_id IS DISTINCT FROM OLD.recycler_id
     OR NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
     OR NEW.final_value IS DISTINCT FROM OLD.final_value
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Only the offer status may change when withdrawing';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_transaction_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS transactions_rules ON transactions;
CREATE TRIGGER transactions_rules
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_rules();

-- Replace the over-broad Phase 2 transaction policies.
DROP POLICY IF EXISTS "Users can read own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create transactions" ON transactions;

CREATE POLICY "Aggregators can read offers for their lots" ON transactions
  FOR SELECT TO authenticated USING (public.is_lot_aggregator(lot_id));

CREATE POLICY "Recyclers can read offers addressed to them" ON transactions
  FOR SELECT TO authenticated USING (public.is_offer_recycler(id));

CREATE POLICY "Aggregators can create offers for their lots" ON transactions
  FOR INSERT TO authenticated WITH CHECK (
    public.current_active_role() = 'aggregator'
    AND public.is_lot_aggregator(lot_id)
    AND status = 'OFFERED_TO_RECYCLER'
    AND payment_status = 'PENDING'
    AND offered_rate > 0
  );

CREATE POLICY "Aggregators can withdraw their own offers" ON transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_active_role() = 'aggregator'
    AND public.is_lot_aggregator(lot_id)
    AND status = 'OFFERED_TO_RECYCLER'
  )
  WITH CHECK (
    public.current_active_role() = 'aggregator'
    AND public.is_lot_aggregator(lot_id)
    AND status = 'WITHDRAWN'
  );

-- ============================================================
-- 6. RECYCLER FACILITY PROFILE: self-service, verification protected
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_recycler_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF public.current_active_role() <> 'recycler' THEN
    RAISE EXCEPTION 'Only a recycler can update a facility profile';
  END IF;

  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'A facility profile cannot change owner';
  END IF;

  -- Verification is an administrator fact, never self-asserted.
  NEW.verification_status := OLD.verification_status;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_recycler_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS recyclers_rules ON recyclers;
CREATE TRIGGER recyclers_rules
  BEFORE UPDATE ON recyclers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recycler_rules();

DROP POLICY IF EXISTS "Recyclers can create their own facility" ON recyclers;
CREATE POLICY "Recyclers can create their own facility" ON recyclers
  FOR INSERT TO authenticated WITH CHECK (
    public.current_active_role() = 'recycler'
    AND profile_id = auth.uid()
    AND verification_status = 'pending'
  );

DROP POLICY IF EXISTS "Recyclers can update their own facility" ON recyclers;
CREATE POLICY "Recyclers can update their own facility" ON recyclers
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- 8. LISTING PHOTOS: no anonymous public read
-- ============================================================
-- The bucket stays usable by the app, but photos are only reachable through
-- short-lived signed URLs for signed-in users.

UPDATE storage.buckets SET public = FALSE WHERE id = 'scrap-listings';

DROP POLICY IF EXISTS "Listing photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Signed-in users can read listing photos" ON storage.objects;
CREATE POLICY "Signed-in users can read listing photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'scrap-listings');

COMMENT ON COLUMN material_lots.source_listing_id IS 'Source listing for traceability. Unique: one lot per completed collection.';
COMMENT ON COLUMN material_lots.aggregator_id IS 'Assigned aggregator. NULL means the lot is available in the aggregator intake.';
