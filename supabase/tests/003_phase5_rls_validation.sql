-- RADDIMART — Phase 5 RLS and workflow validation
--
-- Run against a LOCAL Supabase instance only (never production):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/tests/003_phase5_rls_validation.sql
--
-- Fixtures use fixed IDs and are removed before and after the run. Any failed
-- expectation raises an exception and aborts the script.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS phase5_ctx;

-- ============================================================
-- FIXTURES
-- ============================================================
DELETE FROM auth.users WHERE id::text LIKE 'bbbbbbbb-%';

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-4000-8000-000000000001','authenticated','authenticated','p5-consumer@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P5 Consumer"}'),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-4000-8000-000000000002','authenticated','authenticated','p5-collector@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P5 Collector"}'),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-4000-8000-000000000003','authenticated','authenticated','p5-agg-a@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P5 Aggregator A"}'),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-4000-8000-000000000004','authenticated','authenticated','p5-agg-b@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P5 Aggregator B"}'),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-4000-8000-000000000005','authenticated','authenticated','p5-recycler@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"P5 Recycler"}')
ON CONFLICT (id) DO NOTHING;

UPDATE profiles SET active_role = 'collector'  WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002';
UPDATE profiles SET active_role = 'aggregator' WHERE id = 'bbbbbbbb-0000-4000-8000-000000000003';
UPDATE profiles SET active_role = 'aggregator' WHERE id = 'bbbbbbbb-0000-4000-8000-000000000004';
UPDATE profiles SET active_role = 'recycler'   WHERE id = 'bbbbbbbb-0000-4000-8000-000000000005';

SELECT id AS cat_id FROM material_categories WHERE name = 'E-waste' LIMIT 1 \gset

DELETE FROM scrap_listings WHERE consumer_id = 'bbbbbbbb-0000-4000-8000-000000000001';

INSERT INTO scrap_listings (
  id, consumer_id, collector_id, category_id, approximate_weight,
  condition, pickup_zone, status
) VALUES (
  'cccccccc-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000002',
  :'cat_id',
  10, 'Used', 'P5 Zone', 'ACCEPTED'
);

INSERT INTO scrap_listing_addresses (listing_id, address)
VALUES ('cccccccc-0000-4000-8000-000000000001', '18 Private Phase Five Road');

-- Collector completes the collection through RLS; the lot is created by trigger.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
UPDATE scrap_listings
   SET status = 'COLLECTED', actual_weight = 9.5
 WHERE id = 'cccccccc-0000-4000-8000-000000000001'
   AND collector_id = auth.uid();
COMMIT;

SELECT id AS lot_id FROM material_lots
 WHERE source_listing_id = 'cccccccc-0000-4000-8000-000000000001' \gset

CREATE TABLE phase5_ctx (lot_id UUID, recycler_id UUID, offer_id UUID);
INSERT INTO phase5_ctx (lot_id) VALUES (:'lot_id');
GRANT SELECT ON phase5_ctx TO authenticated, anon;

-- ============================================================
-- 1. AUTOMATIC LOT AND PRIVACY
-- ============================================================
DO $$
DECLARE l material_lots;
BEGIN
  SELECT * INTO l FROM material_lots
   WHERE source_listing_id = 'cccccccc-0000-4000-8000-000000000001';
  IF l.id IS NULL THEN RAISE EXCEPTION 'collection did not create a lot'; END IF;
  IF l.status <> 'IN_AGGREGATOR_INVENTORY' THEN
    RAISE EXCEPTION 'lot must enter aggregator inventory, got %', l.status;
  END IF;
  IF l.aggregator_id IS NOT NULL THEN RAISE EXCEPTION 'new lot must be unassigned'; END IF;
  IF l.pickup_location IS NOT NULL THEN
    RAISE EXCEPTION 'consumer address must not be copied into the lot';
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_lots;
  IF n <> 0 THEN RAISE EXCEPTION 'consumer must not read material lots, saw %', n; END IF;
  SELECT count(*) INTO n FROM scrap_listing_addresses
   WHERE listing_id = 'cccccccc-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'consumer must still read their own address'; END IF;
END $$;
COMMIT;

-- ============================================================
-- 2. INTAKE IS VISIBLE TO APPROVED AGGREGATORS ONLY
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_lots WHERE id = (SELECT lot_id FROM phase5_ctx);
  IF n <> 1 THEN RAISE EXCEPTION 'aggregator must see unassigned intake, saw %', n; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}', true);
UPDATE material_lots SET aggregator_id = 'bbbbbbbb-0000-4000-8000-000000000001'
 WHERE id = (SELECT lot_id FROM phase5_ctx);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_lots
   WHERE id = (SELECT lot_id FROM phase5_ctx) AND aggregator_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'consumer must not claim a lot'; END IF;
END $$;
COMMIT;

-- ============================================================
-- 3. ONE AGGREGATOR, IMMUTABLE LOT FIELDS
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
UPDATE material_lots SET aggregator_id = 'bbbbbbbb-0000-4000-8000-000000000003'
 WHERE id = (SELECT lot_id FROM phase5_ctx) AND aggregator_id IS NULL;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_lots WHERE id = (SELECT lot_id FROM phase5_ctx);
  IF n <> 0 THEN RAISE EXCEPTION 'aggregator B must not see a lot owned by A'; END IF;
  UPDATE material_lots SET aggregator_id = 'bbbbbbbb-0000-4000-8000-000000000004'
   WHERE id = (SELECT lot_id FROM phase5_ctx) AND aggregator_id IS NULL;
  SELECT count(*) INTO n FROM material_lots
   WHERE id = (SELECT lot_id FROM phase5_ctx) AND aggregator_id = 'bbbbbbbb-0000-4000-8000-000000000004';
  IF n <> 0 THEN RAISE EXCEPTION 'aggregator B stole a claimed lot'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE material_lots SET actual_weight = 100 WHERE id = (SELECT lot_id FROM phase5_ctx);
    IF FOUND THEN RAISE EXCEPTION 'aggregator changed a protected lot field'; END IF;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%protected lot field%' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- ============================================================
-- 4. RECYCLER FACILITY AND VERIFICATION
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000005","role":"authenticated"}', true);
INSERT INTO recyclers (profile_id, facility_name, location, verification_status)
VALUES ('bbbbbbbb-0000-4000-8000-000000000005', 'P5 Facility', 'Pune', 'pending');
UPDATE recyclers SET verification_status = 'verified'
 WHERE profile_id = 'bbbbbbbb-0000-4000-8000-000000000005';
DO $$
DECLARE v TEXT;
BEGIN
  SELECT verification_status INTO v FROM recyclers
   WHERE profile_id = 'bbbbbbbb-0000-4000-8000-000000000005';
  IF v <> 'pending' THEN
    RAISE EXCEPTION 'recycler self-verification must not change status, got %', v;
  END IF;
END $$;
COMMIT;

SELECT id AS recycler_id FROM recyclers
 WHERE profile_id = 'bbbbbbbb-0000-4000-8000-000000000005' \gset
UPDATE phase5_ctx SET recycler_id = :'recycler_id';

-- ============================================================
-- 5. OFFERS: OWNERSHIP, ONE LIVE OFFER, VALID TRANSITIONS
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
INSERT INTO transactions (lot_id, recycler_id, offered_rate, status, payment_status)
VALUES ((SELECT lot_id FROM phase5_ctx), (SELECT recycler_id FROM phase5_ctx), 95, 'OFFERED_TO_RECYCLER', 'PENDING');
COMMIT;

SELECT id AS offer_id FROM transactions
 WHERE lot_id = (SELECT lot_id FROM phase5_ctx) AND status = 'OFFERED_TO_RECYCLER' \gset
UPDATE phase5_ctx SET offer_id = :'offer_id';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (lot_id, recycler_id, offered_rate, status, payment_status)
    VALUES ((SELECT lot_id FROM phase5_ctx), (SELECT recycler_id FROM phase5_ctx), 99, 'OFFERED_TO_RECYCLER', 'PENDING');
    RAISE EXCEPTION 'a second live offer unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE transactions SET status = 'COMPLETED' WHERE id = (SELECT offer_id FROM phase5_ctx);
    RAISE EXCEPTION 'an aggregator completed an offer unexpectedly';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%completed an offer unexpectedly%' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase5_ctx);
  IF n <> 0 THEN RAISE EXCEPTION 'aggregator B must not read A''s offer'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000005","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase5_ctx);
  IF n <> 1 THEN RAISE EXCEPTION 'recycler must read the offer addressed to it, saw %', n; END IF;
  SELECT count(*) INTO n FROM material_lots WHERE id = (SELECT lot_id FROM phase5_ctx);
  IF n <> 1 THEN RAISE EXCEPTION 'recycler must read the offered lot'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM transactions WHERE id = (SELECT offer_id FROM phase5_ctx);
  IF n <> 0 THEN RAISE EXCEPTION 'consumer must not read offers'; END IF;
END $$;
COMMIT;

-- Withdraw, keep history, then allow a new offer.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000003","role":"authenticated"}', true);
UPDATE transactions SET status = 'WITHDRAWN'
 WHERE id = (SELECT offer_id FROM phase5_ctx) AND status = 'OFFERED_TO_RECYCLER';
INSERT INTO transactions (lot_id, recycler_id, offered_rate, status, payment_status)
VALUES ((SELECT lot_id FROM phase5_ctx), (SELECT recycler_id FROM phase5_ctx), 92, 'OFFERED_TO_RECYCLER', 'PENDING');
COMMIT;

DO $$
DECLARE st TEXT; ps TEXT; n INT;
BEGIN
  SELECT status, payment_status INTO st, ps FROM transactions WHERE id = (SELECT offer_id FROM phase5_ctx);
  IF st <> 'WITHDRAWN' THEN RAISE EXCEPTION 'withdraw did not persist, got %', st; END IF;
  IF ps <> 'PENDING' THEN RAISE EXCEPTION 'withdraw must not change payment status'; END IF;
  SELECT count(*) INTO n FROM transactions
   WHERE lot_id = (SELECT lot_id FROM phase5_ctx) AND status = 'OFFERED_TO_RECYCLER';
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly one new live offer, got %', n; END IF;
END $$;

-- ============================================================
-- 6. ANONYMOUS ACCESS
-- ============================================================
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_lots;
  IF n <> 0 THEN RAISE EXCEPTION 'anonymous read of material_lots returned rows'; END IF;
  SELECT count(*) INTO n FROM transactions;
  IF n <> 0 THEN RAISE EXCEPTION 'anonymous read of transactions returned rows'; END IF;
  SELECT count(*) INTO n FROM recyclers;
  IF n <> 0 THEN RAISE EXCEPTION 'anonymous read of recyclers returned rows'; END IF;
END $$;
COMMIT;

-- ============================================================
-- CLEANUP
-- ============================================================
DELETE FROM transactions WHERE lot_id = (SELECT lot_id FROM phase5_ctx);
DELETE FROM material_lots WHERE id = (SELECT lot_id FROM phase5_ctx);
DELETE FROM scrap_listings WHERE id = 'cccccccc-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE 'bbbbbbbb-%';
DROP TABLE IF EXISTS phase5_ctx;

\echo ''
\echo 'PHASE 5 RLS VALIDATION: ALL CHECKS PASSED'
