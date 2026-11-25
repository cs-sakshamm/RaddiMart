-- Phase 6: recycler offer response, handover, payment and public verification
-- Additive only. Phase 5 offers are extended, not duplicated.
--
--   OFFERED_TO_RECYCLER ──accept──▶ ACCEPTED_BY_RECYCLER
--                       └─reject──▶ REJECTED_BY_RECYCLER
--   ACCEPTED_BY_RECYCLER ──aggregator records handover──▶ HANDOVER_CONFIRMED
--   HANDOVER_CONFIRMED ──recycler confirms receipt──▶ COMPLETED
--
-- Payment status is independent and is never changed by these transitions.
-- Public verification is a SECURITY DEFINER RPC that returns only approved
-- fields for a COMPLETED handover.

-- ============================================================
-- 1. STATUS CHECKS
-- ============================================================

ALTER TABLE material_lots DROP CONSTRAINT IF EXISTS material_lots_status_check;
ALTER TABLE material_lots
  ADD CONSTRAINT material_lots_status_check
  CHECK (status IN (
    'LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED',
    'IN_AGGREGATOR_INVENTORY', 'HANDOVER_CONFIRMED', 'COMPLETED'
  ));

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN (
    'LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED',
    'IN_AGGREGATOR_INVENTORY', 'OFFERED_TO_RECYCLER', 'REJECTED_BY_RECYCLER',
    'ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED', 'WITHDRAWN'
  ));

-- ============================================================
-- 2. HANDOVER RECORD: explicit references and immutable facts
-- ============================================================

ALTER TABLE handover_records
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES material_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aggregator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recycler_id UUID REFERENCES recyclers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS recycler_confirmed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_handover_records_lot ON handover_records(lot_id);
CREATE INDEX IF NOT EXISTS idx_handover_records_recycler ON handover_records(recycler_id);

-- Backfill references for any records created before this migration.
UPDATE handover_records h
SET lot_id = t.lot_id,
    recycler_id = t.recycler_id,
    aggregator_id = l.aggregator_id
FROM transactions t
JOIN material_lots l ON l.id = t.lot_id
WHERE t.id = h.transaction_id
  AND (h.lot_id IS NULL OR h.recycler_id IS NULL OR h.aggregator_id IS NULL);

-- ============================================================
-- 3. STATUS HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_events_transaction
  ON transaction_events(transaction_id, created_at);

ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_transaction_aggregator(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM transactions t
    JOIN material_lots l ON l.id = t.lot_id
    WHERE t.id = p_transaction_id AND l.aggregator_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_transaction_aggregator(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_transaction_aggregator(UUID) TO authenticated;

-- ============================================================
-- 5. TRANSACTION RULES: response, withdraw and payment
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_transaction_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Internal handover functions perform the one trusted status change.
  IF current_setting('raddimart.system_update', true) = 'on' THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR public.is_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  v_role := public.current_active_role();

  IF TG_OP = 'INSERT' THEN
    IF v_role <> 'aggregator' THEN
      RAISE EXCEPTION 'Only an aggregator can create an offer';
    END IF;
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

  IF v_role = 'aggregator' THEN
    IF NOT public.is_lot_aggregator(OLD.lot_id) THEN
      RAISE EXCEPTION 'You can only change an offer for your own lot';
    END IF;

    -- Withdrawal of an unanswered offer.
    IF OLD.status = 'OFFERED_TO_RECYCLER' AND NEW.status = 'WITHDRAWN' THEN
      IF NEW.lot_id IS DISTINCT FROM OLD.lot_id
         OR NEW.recycler_id IS DISTINCT FROM OLD.recycler_id
         OR NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
         OR NEW.final_value IS DISTINCT FROM OLD.final_value
         OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'Only the offer status may change when withdrawing';
      END IF;
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    -- Payment is a separate fact, editable by the paying aggregator only
    -- after the recycler has accepted. It is never inferred from handover.
    IF OLD.status = NEW.status
       AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      IF OLD.status NOT IN ('ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED') THEN
        RAISE EXCEPTION 'Payment can only be recorded after the offer is accepted';
      END IF;
      IF NEW.payment_status <> 'PAID' THEN
        RAISE EXCEPTION 'A recorded payment can only move to PAID';
      END IF;
      IF NEW.lot_id IS DISTINCT FROM OLD.lot_id
         OR NEW.recycler_id IS DISTINCT FROM OLD.recycler_id
         OR NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
         OR NEW.final_value IS DISTINCT FROM OLD.final_value
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Only the payment status may change';
      END IF;
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'An aggregator cannot make this offer transition';
  END IF;

  IF v_role = 'recycler' THEN
    IF NOT public.is_offer_recycler(OLD.id) THEN
      RAISE EXCEPTION 'This offer belongs to another recycler facility';
    END IF;
    IF OLD.status <> 'OFFERED_TO_RECYCLER' THEN
      RAISE EXCEPTION 'This offer has already been answered';
    END IF;
    IF NEW.status NOT IN ('ACCEPTED_BY_RECYCLER', 'REJECTED_BY_RECYCLER') THEN
      RAISE EXCEPTION 'A recycler can only accept or reject an open offer';
    END IF;
    IF NEW.lot_id IS DISTINCT FROM OLD.lot_id
       OR NEW.recycler_id IS DISTINCT FROM OLD.recycler_id
       OR NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
       OR NEW.final_value IS DISTINCT FROM OLD.final_value
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Only the offer status may change when responding';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the aggregator or the addressed recycler can change an offer';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_transaction_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS transactions_rules ON transactions;
CREATE TRIGGER transactions_rules
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_rules();

-- ============================================================
-- 6. RECORD EVERY STATUS CHANGE
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_transaction_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO transaction_events (transaction_id, from_status, to_status, actor_id)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_transaction_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS transactions_record_event ON transactions;
CREATE TRIGGER transactions_record_event
  AFTER INSERT OR UPDATE OF status ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_transaction_event();

-- ============================================================
-- 7. LOT RULES: allow only the internal handover transition
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_material_lot_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('raddimart.system_update', true) = 'on'
     OR auth.uid() IS NULL
     OR public.is_admin() THEN
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

-- ============================================================
-- 8. HANDOVER RULES AND TWO-PARTY CUSTODY
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_handover_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx transactions%ROWTYPE;
  v_lot material_lots%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = NEW.transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The offer for this handover does not exist';
  END IF;
  IF v_tx.status <> 'ACCEPTED_BY_RECYCLER' THEN
    RAISE EXCEPTION 'Handover can only be recorded after the recycler accepts';
  END IF;

  SELECT * INTO v_lot FROM material_lots WHERE id = v_tx.lot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The lot for this handover does not exist';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NOT public.is_transaction_aggregator(NEW.transaction_id) THEN
    RAISE EXCEPTION 'Only the aggregator responsible for this lot can record handover';
  END IF;

  IF NEW.received_weight IS NULL OR NEW.received_weight <= 0 THEN
    RAISE EXCEPTION 'Record the final received weight above zero';
  END IF;

  -- References are derived, never supplied by the browser.
  NEW.lot_id := v_tx.lot_id;
  NEW.recycler_id := v_tx.recycler_id;
  NEW.aggregator_id := v_lot.aggregator_id;
  NEW.handover_timestamp := COALESCE(NEW.handover_timestamp, NOW());
  NEW.recycler_confirmation := FALSE;
  NEW.recycler_confirmed_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_handover_record() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.apply_handover_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM set_config('raddimart.system_update', 'on', true);

    UPDATE transactions
       SET status = 'HANDOVER_CONFIRMED',
           final_value = ROUND(COALESCE(offered_rate, 0) * NEW.received_weight, 2)
     WHERE id = NEW.transaction_id;

    UPDATE material_lots
       SET status = 'HANDOVER_CONFIRMED'
     WHERE id = NEW.lot_id;

    PERFORM set_config('raddimart.system_update', 'off', true);
    RETURN NEW;
  END IF;

  IF NEW.recycler_confirmation AND NOT OLD.recycler_confirmation THEN
    PERFORM set_config('raddimart.system_update', 'on', true);

    UPDATE transactions SET status = 'COMPLETED' WHERE id = NEW.transaction_id;
    UPDATE material_lots SET status = 'COMPLETED' WHERE id = NEW.lot_id;

    PERFORM set_config('raddimart.system_update', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_handover_record() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_handover_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NOT public.is_offer_recycler(OLD.transaction_id) THEN
    RAISE EXCEPTION 'Only the addressed recycler can confirm this handover';
  END IF;

  IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.lot_id IS DISTINCT FROM OLD.lot_id
     OR NEW.recycler_id IS DISTINCT FROM OLD.recycler_id
     OR NEW.aggregator_id IS DISTINCT FROM OLD.aggregator_id
     OR NEW.received_weight IS DISTINCT FROM OLD.received_weight
     OR NEW.handover_timestamp IS DISTINCT FROM OLD.handover_timestamp
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'Handover facts cannot be rewritten after recording';
  END IF;

  IF OLD.recycler_confirmation AND NOT NEW.recycler_confirmation THEN
    RAISE EXCEPTION 'A confirmed handover cannot be unconfirmed';
  END IF;

  IF NEW.recycler_confirmation AND NOT OLD.recycler_confirmation THEN
    NEW.recycler_confirmed_at := NOW();
  ELSE
    NEW.recycler_confirmed_at := OLD.recycler_confirmed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_handover_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS handover_records_prepare ON handover_records;
CREATE TRIGGER handover_records_prepare
  BEFORE INSERT ON handover_records
  FOR EACH ROW EXECUTE FUNCTION public.prepare_handover_record();

DROP TRIGGER IF EXISTS handover_records_update ON handover_records;
CREATE TRIGGER handover_records_update
  BEFORE UPDATE ON handover_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_handover_update();

DROP TRIGGER IF EXISTS handover_records_apply ON handover_records;
CREATE TRIGGER handover_records_apply
  AFTER INSERT OR UPDATE ON handover_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_handover_record();

-- ============================================================
-- 9. RLS: recycler response, payment, handover and history
-- ============================================================

DROP POLICY IF EXISTS "Recyclers can respond to their offers" ON transactions;
CREATE POLICY "Recyclers can respond to their offers" ON transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_active_role() = 'recycler'
    AND public.is_offer_recycler(id)
    AND status = 'OFFERED_TO_RECYCLER'
  )
  WITH CHECK (
    public.current_active_role() = 'recycler'
    AND public.is_offer_recycler(id)
    AND status IN ('ACCEPTED_BY_RECYCLER', 'REJECTED_BY_RECYCLER')
  );

DROP POLICY IF EXISTS "Aggregators can record payment for their offers" ON transactions;
CREATE POLICY "Aggregators can record payment for their offers" ON transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_active_role() = 'aggregator'
    AND public.is_lot_aggregator(lot_id)
    AND status IN ('ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED')
  )
  WITH CHECK (
    public.current_active_role() = 'aggregator'
    AND public.is_lot_aggregator(lot_id)
  );

DROP POLICY IF EXISTS "Users can read own handover records" ON handover_records;
DROP POLICY IF EXISTS "Admins can modify handover records" ON handover_records;
DROP POLICY IF EXISTS "Parties can read their handover records" ON handover_records;
DROP POLICY IF EXISTS "Aggregators can record handover for their offers" ON handover_records;
DROP POLICY IF EXISTS "Recyclers can confirm their handovers" ON handover_records;

CREATE POLICY "Parties can read their handover records" ON handover_records
  FOR SELECT TO authenticated USING (
    public.is_transaction_aggregator(transaction_id)
    OR public.is_offer_recycler(transaction_id)
    OR public.is_admin()
  );

CREATE POLICY "Aggregators can record handover for their offers" ON handover_records
  FOR INSERT TO authenticated WITH CHECK (
    public.current_active_role() = 'aggregator'
    AND public.is_transaction_aggregator(transaction_id)
    AND EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = handover_records.transaction_id
        AND t.status = 'ACCEPTED_BY_RECYCLER'
    )
  );

CREATE POLICY "Recyclers can confirm their handovers" ON handover_records
  FOR UPDATE TO authenticated
  USING (public.is_offer_recycler(transaction_id) OR public.is_admin())
  WITH CHECK (public.is_offer_recycler(transaction_id) OR public.is_admin());

DROP POLICY IF EXISTS "Offer parties can read status history" ON transaction_events;
CREATE POLICY "Offer parties can read status history" ON transaction_events
  FOR SELECT TO authenticated USING (
    public.is_transaction_aggregator(transaction_id)
    OR public.is_offer_recycler(transaction_id)
    OR public.is_admin()
  );

-- ============================================================
-- 10. PUBLIC VERIFICATION: approved fields only
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_handover_verification(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'record_reference', UPPER(SUBSTRING(REPLACE(h.id::TEXT, '-', '') FROM 1 FOR 10)),
    'handover_at', h.handover_timestamp,
    'received_weight', h.received_weight,
    'lot_reference', UPPER(SUBSTRING(REPLACE(l.lot_code::TEXT, '-', '') FROM 1 FOR 8)),
    'category', c.name,
    'subcategory', sc.name,
    'facility_name', r.facility_name,
    'facility_location', r.location,
    'completed_at', t.updated_at
  )
  FROM handover_records h
  JOIN transactions t ON t.id = h.transaction_id
  JOIN material_lots l ON l.id = h.lot_id
  LEFT JOIN material_categories c ON c.id = l.category_id
  LEFT JOIN material_categories sc ON sc.id = l.subcategory_id
  LEFT JOIN recyclers r ON r.id = h.recycler_id
  WHERE h.qr_token = p_token
    AND h.recycler_confirmation = TRUE
    AND t.status = 'COMPLETED';
$$;

REVOKE ALL ON FUNCTION public.get_handover_verification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_handover_verification(UUID) TO anon, authenticated;

COMMENT ON TABLE transaction_events IS 'Append-only status history for offers and handovers. Written by trigger, readable by the two parties and admins.';
COMMENT ON COLUMN handover_records.received_weight IS 'Final weight recorded at handover. Never overwrites collected or estimated lot weights.';
COMMENT ON COLUMN handover_records.recycler_confirmed_at IS 'When the recycler confirmed receipt; completion is derived from this, not assumed.';
COMMENT ON FUNCTION public.get_handover_verification(UUID) IS 'Public read-only verification for completed handovers. Deliberately excludes addresses, contacts, rates and payment.';
