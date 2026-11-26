-- RADDIMART — Phase 3/Phase 4 RLS and workflow validation
--
-- Run against a LOCAL Supabase instance only (never production):
--   supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/tests/002_phase3_phase4_rls_validation.sql
--
-- Uses fixed test UUIDs and cleans up after itself. It never touches
-- existing project data: every fixture is created in this script.
--
-- Any failed expectation raises an exception and aborts the run.

\set ON_ERROR_STOP on

-- ============================================================
-- FIXTURES (idempotent: remove any fixtures from an earlier run first)
-- ============================================================
DELETE FROM auth.users WHERE id::text LIKE 'aaaaaaaa-%';
DELETE FROM role_requests WHERE id::text LIKE 'eeeeeeee-%';

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000001','authenticated','authenticated','rls-consumer-a@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"Consumer A"}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000002','authenticated','authenticated','rls-consumer-b@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"Consumer B"}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000003','authenticated','authenticated','rls-collector@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"Collector C"}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000004','authenticated','authenticated','rls-aggregator@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"Aggregator D"}'),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000005','authenticated','authenticated','rls-admin@test.local',crypt('x',gen_salt('bf')),now(),now(),now(),'{}','{"full_name":"Admin E"}')
ON CONFLICT (id) DO NOTHING;

-- The signup trigger must have created one profile per auth user (default consumer).
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM profiles
   WHERE id IN ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',
                'aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000004',
                'aaaaaaaa-0000-4000-8000-000000000005');
  IF n <> 5 THEN RAISE EXCEPTION 'handle_new_user trigger: expected 5 profiles, got %', n; END IF;
  SELECT count(*) INTO n FROM profiles
   WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001' AND active_role = 'consumer';
  IF n <> 1 THEN RAISE EXCEPTION 'new profiles must default to consumer'; END IF;
END $$;

-- Give the collector the collector role and the admin the admin flag.
-- (Direct SQL as postgres, equivalent to an approved role request.)
UPDATE profiles SET active_role = 'collector' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003';
UPDATE profiles SET active_role = 'aggregator' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000004';
UPDATE profiles SET is_admin = TRUE WHERE id = 'aaaaaaaa-0000-4000-8000-000000000005';

DELETE FROM scrap_listings
 WHERE consumer_id IN ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002');

-- ============================================================
-- 1. PROFILE VISIBILITY (regression: infinite recursion in profiles policy)
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM profiles;
  IF n <> 1 THEN RAISE EXCEPTION 'consumer must see only own profile, saw %', n; END IF;
  SELECT count(*) INTO n FROM profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'consumer must not see another profile'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM profiles;
  IF n < 5 THEN RAISE EXCEPTION 'admin must see all profiles, saw %', n; END IF;
END $$;
COMMIT;

-- A user cannot promote themselves through a direct profile write.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE profiles SET active_role = 'collector' WHERE id = auth.uid();
    RAISE EXCEPTION 'self role change unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'self role change unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE profiles SET is_admin = TRUE WHERE id = auth.uid();
    RAISE EXCEPTION 'self admin promotion unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'self admin promotion unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- ============================================================
-- 2. CONSUMER CREATES A LISTING (consumer_id must be the caller)
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
INSERT INTO scrap_listings
  (consumer_id, category_id, subcategory_id, approximate_weight, condition,
   pickup_zone, preferred_pickup_time, status)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000101',
   12, 'Used', 'Pune West', now() + interval '2 days', 'LISTED');

INSERT INTO scrap_listing_addresses (listing_id, address)
SELECT id, '12 Test Street, Pune' FROM scrap_listings WHERE consumer_id = auth.uid();
COMMIT;

-- Creating a listing on behalf of another consumer must fail.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO scrap_listings (consumer_id, category_id, approximate_weight, condition, pickup_zone)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 5, 'Used', 'spoof');
    RAISE EXCEPTION 'spoofed listing insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected: RLS WITH CHECK rejected the row
  END;
END $$;
COMMIT;

-- ============================================================
-- 3. PRIVATE LISTING DATA IS NOT VISIBLE TO OTHER CONSUMERS
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listings;
  IF n <> 0 THEN RAISE EXCEPTION 'consumer B must not see consumer A listings, saw %', n; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listings;
  IF n <> 0 THEN RAISE EXCEPTION 'anon must not see listings, saw %', n; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listings;
  IF n <> 0 THEN RAISE EXCEPTION 'aggregator must not see marketplace listings, saw %', n; END IF;
END $$;
COMMIT;

-- ============================================================
-- 4. COLLECTOR MARKETPLACE VISIBILITY
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listings WHERE status = 'LISTED';
  IF n <> 1 THEN RAISE EXCEPTION 'collector must see 1 available listing, saw %', n; END IF;
  -- The CANCELLED and COLLECTED states must drop out of the marketplace.
  SELECT count(*) INTO n FROM scrap_listings WHERE status = 'CANCELLED';
  IF n <> 0 THEN RAISE EXCEPTION 'cancelled listings must not be visible to collectors'; END IF;
END $$;
COMMIT;

-- ============================================================
-- 5. COLLECTOR CLAIMS THE LISTING
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE scrap_listings
     SET collector_id = 'aaaaaaaa-0000-4000-8000-000000000003', status = 'ACCEPTED'
   WHERE status = 'LISTED' AND collector_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'collector claim expected 1 row, updated %', n; END IF;
END $$;
COMMIT;

-- A second claim (same or different collector) must update nothing: duplicate
-- acceptance is prevented by the USING clause (collector_id IS NULL).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE scrap_listings SET status = 'ACCEPTED'
   WHERE collector_id IS NULL AND status IN ('LISTED','PICKUP_REQUESTED');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'duplicate acceptance must not update rows, updated %', n; END IF;
END $$;
COMMIT;

-- A non-collector cannot claim.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE scrap_listings
     SET collector_id = 'aaaaaaaa-0000-4000-8000-000000000004', status = 'ACCEPTED'
   WHERE collector_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'aggregator must not claim listings, updated %', n; END IF;
END $$;
COMMIT;

-- ============================================================
-- 6. CONSUMER CANNOT EDIT A CLAIMED LISTING OR TOUCH COLLECTOR FIELDS
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE scrap_listings SET status = 'CANCELLED' WHERE consumer_id = auth.uid();
    RAISE EXCEPTION 'consumer cancel of accepted listing unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'consumer cancel of accepted listing unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE scrap_listings SET actual_weight = 99 WHERE consumer_id = auth.uid();
    RAISE EXCEPTION 'consumer write of actual_weight unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'consumer write of actual_weight unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- ============================================================
-- 7. COLLECTOR CANNOT REWRITE THE MATERIAL TERMS
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
UPDATE scrap_listings
   SET pickup_zone = 'Hijacked zone', approximate_weight = 0.5
 WHERE collector_id = auth.uid();
DO $$
DECLARE v_zone TEXT; v_w NUMERIC;
BEGIN
  SELECT pickup_zone, approximate_weight INTO v_zone, v_w
    FROM scrap_listings WHERE collector_id = auth.uid();
  IF v_zone = 'Hijacked zone' THEN RAISE EXCEPTION 'collector rewrote pickup_zone'; END IF;
  IF v_w <> 12 THEN RAISE EXCEPTION 'collector rewrote approximate_weight: %', v_w; END IF;
END $$;
COMMIT;

-- ============================================================
-- 7b. PICKUP ADDRESS PRIVACY
-- ============================================================
-- Consumer B lists a second, still unclaimed listing plus its address.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
INSERT INTO scrap_listings
  (consumer_id, category_id, approximate_weight, condition, pickup_zone, status)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 4, 'Used', 'Pune East', 'LISTED');
COMMIT;

-- The address insert (separate statement) must be scoped to B's own listing.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
INSERT INTO scrap_listing_addresses (listing_id, address)
SELECT id, '9 Other Road, Pune' FROM scrap_listings WHERE consumer_id = auth.uid();
COMMIT;

-- The assigned collector can read the accepted pickup's address only.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listing_addresses;
  IF n <> 1 THEN RAISE EXCEPTION 'collector must read only assigned addresses, saw %', n; END IF;
  SELECT count(*) INTO n FROM scrap_listing_addresses a WHERE a.address = '9 Other Road, Pune';
  IF n <> 0 THEN RAISE EXCEPTION 'collector read the address of an unclaimed listing'; END IF;
END $$;
COMMIT;

-- Unrelated roles cannot read any address, and the owner can read their own.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listing_addresses;
  IF n <> 0 THEN RAISE EXCEPTION 'unrelated user must not read addresses, saw %', n; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listing_addresses;
  IF n <> 1 THEN RAISE EXCEPTION 'owner must read own address, saw %', n; END IF;
END $$;
COMMIT;

-- ============================================================
-- 8. COLLECTION COMPLETION AND INVALID TRANSITIONS
-- ============================================================
-- ACCEPTED -> LISTED is not an allowed transition for the assigned collector.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE scrap_listings SET status = 'COLLECTED' WHERE collector_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'valid ACCEPTED -> COLLECTED transition failed: %', SQLERRM;
  END;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    UPDATE scrap_listings SET status = 'LISTED' WHERE collector_id = auth.uid();
    RAISE EXCEPTION 'COLLECTED -> LISTED unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'COLLECTED -> LISTED unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- The collector still sees their completed pickup.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM scrap_listings WHERE status = 'COLLECTED' AND collector_id = auth.uid();
  IF n <> 1 THEN RAISE EXCEPTION 'collector must see completed pickup, saw %', n; END IF;
END $$;
COMMIT;

-- Another collector must not be able to modify this accepted pickup.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
DECLARE n INT;
BEGIN
  UPDATE scrap_listings SET actual_weight = 50 WHERE status = 'COLLECTED';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'non-owner modified a pickup, updated %', n; END IF;
END $$;
COMMIT;

-- ============================================================
-- 9. ROLE APPROVAL FUNCTION
-- ============================================================
INSERT INTO role_requests (id, user_id, requested_role, applicant_name, status)
VALUES ('eeeeeeee-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','local_collector','Consumer B','pending')
ON CONFLICT (id) DO NOTHING;

-- A consumer cannot approve their own request.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM approve_role_request('eeeeeeee-0000-4000-8000-000000000001', 'approved', 'self');
    RAISE EXCEPTION 'self approval unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Users cannot approve their own role request.%' THEN
      NULL; -- expected
    ELSE
      RAISE;
    END IF;
  END;
END $$;
COMMIT;

-- An admin approves: local_collector maps to collector.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000005","role":"authenticated"}', true);
SELECT approve_role_request('eeeeeeee-0000-4000-8000-000000000001', 'approved', 'verified');
COMMIT;

DO $$
DECLARE v_role TEXT; v_status TEXT;
BEGIN
  SELECT active_role INTO v_role FROM profiles WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002';
  SELECT status INTO v_status FROM role_requests WHERE id = 'eeeeeeee-0000-4000-8000-000000000001';
  IF v_status <> 'approved' THEN RAISE EXCEPTION 'role request not approved: %', v_status; END IF;
  IF v_role <> 'collector' THEN RAISE EXCEPTION 'local_collector must map to collector, got %', v_role; END IF;
END $$;

-- ============================================================
-- CLEANUP
-- ============================================================
DELETE FROM scrap_listings WHERE consumer_id::text LIKE 'aaaaaaaa-%';
DELETE FROM role_requests WHERE id = 'eeeeeeee-0000-4000-8000-000000000001';
DELETE FROM profiles WHERE id::text LIKE 'aaaaaaaa-%';
DELETE FROM auth.users WHERE id::text LIKE 'aaaaaaaa-%';

\echo 'PHASE 3/4 RLS VALIDATION: ALL CHECKS PASSED'
