-- RADDIMART — Phase 6 RLS, handover, payment and verification validation
--
-- Run against a LOCAL Supabase instance only (never production):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/tests/004_phase6_rls_validation.sql
--
-- Fixed fixtures are removed before and after the run. Any failed expectation
-- raises an exception and aborts the script.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS phase6_ctx;

DELETE FROM auth.users WHERE id::text LIKE 'dddddddd-%';

-- ============================================================
-- FIXTURES
-- ============================================================
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000','dddddddd-0000-4000-8000-000000000001','authenticated','authenticated','p6-consumer@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P6 Consumer"}'),
  ('00000000-0000-0000-0000-000000000000','dddddddd-0000-4000-8000-000000000002','authenticated','authenticated','p6-collector@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P6 Collector"}'),
  ('00000000-0000-0000-0000-000000000000','dddddddd-0000-4000-8000-000000000003','authenticated','authenticated','p6-agg@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P6 Aggregator"}'),
  ('00000000-0000-0000-0000-000000000000','dddddddd-0000-4000-8000-000000000004','authenticated','authenticated','p6-recycler@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P6 Recycler"}'),
  ('00000000-0000-0000-0000-000000000000','dddddddd-0000-4000-8000-000000000005','authenticated','authenticated','p6-other@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P6 Other Recycler"}')
ON CONFLICT (id) DO NOTHING;

UPDATE profiles SET active_role = 'collector'  WHERE id = 'dddddddd-0000-4000-8000-000000000002';
UPDATE profiles SET active_role = 'aggregator' WHERE id = 'dddddddd-0000-4000-8000-000000000003';
UPDATE profiles SET active_role = 'recycler'   WHERE id = 'dddddddd-0000-4000-8000-000000000004';
UPDATE profiles SET active_role = 'recycler'   WHERE id = 'dddddddd-0000-4000-8000-000000000005';

SELECT id AS cat_id FROM material_categories WHERE name = 'E-waste' LIMIT 1 \gset

INSERT INTO recyclers (id, profile_id, facility_name, location, accepted_categories, verification_status)
VALUES
  ('dddddddd-1000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000004','P6 Main Facility','Pune',ARRAY['E-waste'],'pending'),
  ('dddddddd-1000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000005','P6 Other Facility','Mumbai',ARRAY['Metals'],'pending')
ON CONFLICT (id) DO NOTHING;

INSERT INTO scrap_listings (
  id, consumer_id, collector_id, category_id, approximate_weight,
  condition, pickup_zone, status
) VALUES (
  'eeeeeeee-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000002',
  :'cat_id', 10, 'Used', 'P6 Zone', 'ACCEPTED'
);

INSERT INTO scrap_listing_addresses (listing_id, address)
VALUES ('eeeeeeee-0000-4000-8000-000000000001', '99 Private Phase Six Road');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000002","role":"authenticated"}', true);
UPDATE scrap_listings
   SET status = 'COLLECTED', actual_weight = 9.5
 WHERE id = 'eeeeeeee-0000-4000-8000-000000000001'
   AND collector_id = auth.uid();
COMMIT;

SELECT id AS lot_id FROM material_lots
 WHERE source_listing_id = 'eeeeeeee-0000-4000-8000-000000000001' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}', true);
UPDATE material_lots SET aggregator_id = auth.uid()
 WHERE id = :'lot_id' AND aggregator_id IS NULL;
INSERT INTO transactions (lot_id, recycler_id, offered_rate, status, payment_status)
VALUES (:'lot_id', 'dddddddd-1000-4000-8000-000000000001', 95, 'OFFERED_TO_RECYCLER', 'PENDING')
RETURNING id AS offer_id \gset
COMMIT;

CREATE TABLE phase6_ctx (lot_id UUID, offer_id UUID, handover_id UUID, qr_token UUID);
INSERT INTO phase6_ctx (lot_id, offer_id) VALUES (:'lot_id', :'offer_id');
GRANT SELECT ON phase6_ctx TO authenticated, anon;

-- ============================================================
-- 1. OFFER VISIBILITY AND DUPLICATE RESPONSE
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000005","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF n <> 0 THEN RAISE EXCEPTION 'other recycler must not read the offer'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF n <> 0 THEN RAISE EXCEPTION 'consumer must not read the offer'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF n <> 1 THEN RAISE EXCEPTION 'addressed recycler must read the offer, saw %', n; END IF;

  UPDATE transactions SET status = 'ACCEPTED_BY_RECYCLER'
   WHERE id = (SELECT offer_id FROM phase6_ctx) AND status = 'OFFERED_TO_RECYCLER';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'first accept must update one offer, got %', n; END IF;

  UPDATE transactions SET status = 'REJECTED_BY_RECYCLER'
   WHERE id = (SELECT offer_id FROM phase6_ctx) AND status = 'OFFERED_TO_RECYCLER';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'duplicate response must match no rows, got %', n; END IF;
END $$;
COMMIT;

-- ============================================================
-- 2. HANDOVER: SEPARATE WEIGHT, IMMUTABLE REFERENCES
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}', true);
INSERT INTO handover_records (transaction_id, received_weight, handover_timestamp, notes)
VALUES ((SELECT offer_id FROM phase6_ctx), 12.7, NOW() - INTERVAL '1 hour', 'Weighed at gate')
RETURNING id AS handover_id, qr_token AS qr_token \gset
COMMIT;

UPDATE phase6_ctx SET handover_id = :'handover_id', qr_token = :'qr_token';

DO $$
DECLARE h handover_records; t transactions; l material_lots;
BEGIN
  SELECT * INTO h FROM handover_records WHERE id = (SELECT handover_id FROM phase6_ctx);
  IF h.lot_id IS DISTINCT FROM (SELECT lot_id FROM phase6_ctx) THEN
    RAISE EXCEPTION 'handover lot reference was not derived';
  END IF;
  IF h.aggregator_id IS DISTINCT FROM 'dddddddd-0000-4000-8000-000000000003'::UUID THEN
    RAISE EXCEPTION 'handover aggregator reference was not derived';
  END IF;
  IF h.recycler_id IS DISTINCT FROM 'dddddddd-1000-4000-8000-000000000001'::UUID THEN
    RAISE EXCEPTION 'handover recycler reference was not derived';
  END IF;
  IF h.received_weight <> 12.7 THEN RAISE EXCEPTION 'handover weight not stored'; END IF;

  SELECT * INTO t FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF t.status <> 'HANDOVER_CONFIRMED' THEN
    RAISE EXCEPTION 'transaction must be HANDOVER_CONFIRMED, got %', t.status;
  END IF;
  IF t.final_value <> 1206.50 THEN
    RAISE EXCEPTION 'final value must use received weight, got %', t.final_value;
  END IF;
  IF t.payment_status <> 'PENDING' THEN
    RAISE EXCEPTION 'handover must not mark payment paid';
  END IF;

  SELECT * INTO l FROM material_lots WHERE id = (SELECT lot_id FROM phase6_ctx);
  IF l.actual_weight <> 9.5 THEN
    RAISE EXCEPTION 'received weight must not overwrite collected weight, got %', l.actual_weight;
  END IF;
  IF l.status <> 'HANDOVER_CONFIRMED' THEN
    RAISE EXCEPTION 'lot must be HANDOVER_CONFIRMED, got %', l.status;
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE handover_records SET received_weight = 99
     WHERE id = (SELECT handover_id FROM phase6_ctx);
    RAISE EXCEPTION 'handover weight rewrite was not rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'handover weight rewrite was not rejected' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- ============================================================
-- 3. PAYMENT IS INDEPENDENT AND AGGREGATOR-ONLY
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE transactions SET payment_status = 'PAID'
   WHERE id = (SELECT offer_id FROM phase6_ctx);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'recycler must not record payment'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}', true);
UPDATE transactions SET payment_status = 'PAID'
 WHERE id = (SELECT offer_id FROM phase6_ctx) AND payment_status = 'PENDING';
COMMIT;

DO $$
DECLARE t transactions;
BEGIN
  SELECT * INTO t FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF t.payment_status <> 'PAID' THEN RAISE EXCEPTION 'payment status was not recorded'; END IF;
  IF t.status <> 'HANDOVER_CONFIRMED' THEN
    RAISE EXCEPTION 'payment must not change handover status, got %', t.status;
  END IF;
END $$;

-- ============================================================
-- 4. PUBLIC VERIFICATION AND COMPLETION
-- ============================================================
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF get_handover_verification((SELECT qr_token FROM phase6_ctx)) IS NOT NULL THEN
    RAISE EXCEPTION 'unconfirmed handover must not be publicly verifiable';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
UPDATE handover_records SET recycler_confirmation = TRUE
 WHERE id = (SELECT handover_id FROM phase6_ctx)
   AND recycler_confirmation = FALSE;
COMMIT;

DO $$
DECLARE t transactions; l material_lots; v JSONB;
BEGIN
  SELECT * INTO t FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
  IF t.status <> 'COMPLETED' THEN RAISE EXCEPTION 'transaction must be COMPLETED, got %', t.status; END IF;
  SELECT * INTO l FROM material_lots WHERE id = (SELECT lot_id FROM phase6_ctx);
  IF l.status <> 'COMPLETED' THEN RAISE EXCEPTION 'lot must be COMPLETED, got %', l.status; END IF;

  v := get_handover_verification((SELECT qr_token FROM phase6_ctx));
  IF v IS NULL THEN RAISE EXCEPTION 'completed handover must be publicly verifiable'; END IF;
  IF (v->>'received_weight')::NUMERIC <> 12.7 THEN RAISE EXCEPTION 'public weight wrong'; END IF;
  IF v->>'category' IS DISTINCT FROM 'E-waste' THEN RAISE EXCEPTION 'public category wrong'; END IF;
  IF v->>'facility_name' IS DISTINCT FROM 'P6 Main Facility' THEN RAISE EXCEPTION 'public facility wrong'; END IF;
  IF jsonb_exists(v, 'address') OR jsonb_exists(v, 'contact_email')
     OR jsonb_exists(v, 'offered_rate') OR jsonb_exists(v, 'payment_status') THEN
    RAISE EXCEPTION 'public verification exposed a private field';
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM handover_records;
  IF n <> 0 THEN RAISE EXCEPTION 'anonymous direct read of handover_records returned rows'; END IF;
END $$;
COMMIT;

-- ============================================================
-- CLEANUP
-- ============================================================
DELETE FROM transactions WHERE id = (SELECT offer_id FROM phase6_ctx);
DELETE FROM material_lots WHERE id = (SELECT lot_id FROM phase6_ctx);
DELETE FROM scrap_listings WHERE id = 'eeeeeeee-0000-4000-8000-000000000001';
DELETE FROM recyclers WHERE id::text LIKE 'dddddddd-1000-%';
DELETE FROM auth.users WHERE id::text LIKE 'dddddddd-%';
DROP TABLE IF EXISTS phase6_ctx;

\echo ''
\echo 'PHASE 6 RLS VALIDATION: ALL CHECKS PASSED'
