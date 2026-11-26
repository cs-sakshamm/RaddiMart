-- RADDIMART — catalogue bootstrap and listing-reference validation
--
-- Run against a LOCAL Supabase instance only:
--   supabase migration up --local
--   docker exec -i supabase_db_RADDIMART psql -U postgres -d postgres \
--     -f supabase/tests/005_catalogue_validation.sql
--
-- Uses one fixed fixture UUID and removes it at both ends of the run. It never
-- changes the administrator-managed catalogue. Any failed expectation raises
-- an exception and aborts the run.

\set ON_ERROR_STOP on

-- Catalogue shape and idempotency -------------------------------------------
DO $$
DECLARE
  v_total INT;
  v_parents INT;
  v_subcategories INT;
  v_orphans INT;
  v_bad_flags INT;
  v_duplicate_parents INT;
  v_duplicate_subcategories INT;
  v_active_rates INT;
  v_expected_rates INT;
  v_trigger INT;
BEGIN
  SELECT count(*) INTO v_total FROM material_categories;
  SELECT count(*) INTO v_parents
    FROM material_categories WHERE parent_id IS NULL AND COALESCE(is_subcategory, FALSE) = FALSE;
  SELECT count(*) INTO v_subcategories
    FROM material_categories WHERE parent_id IS NOT NULL AND COALESCE(is_subcategory, FALSE) = TRUE;
  SELECT count(*) INTO v_orphans
    FROM material_categories child
    WHERE child.parent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM material_categories parent WHERE parent.id = child.parent_id);
  SELECT count(*) INTO v_bad_flags
    FROM material_categories
    WHERE (parent_id IS NULL AND COALESCE(is_subcategory, FALSE))
       OR (parent_id IS NOT NULL AND NOT COALESCE(is_subcategory, FALSE));
  SELECT count(*) INTO v_duplicate_parents
    FROM (
      SELECT name FROM material_categories
      WHERE parent_id IS NULL GROUP BY name HAVING count(*) > 1
    ) duplicates;
  SELECT count(*) INTO v_duplicate_subcategories
    FROM (
      SELECT name, parent_id FROM material_categories
      WHERE parent_id IS NOT NULL GROUP BY name, parent_id HAVING count(*) > 1
    ) duplicates;
  SELECT count(*) INTO v_active_rates FROM price_rates WHERE is_active IS TRUE;
  SELECT count(*) INTO v_expected_rates
    FROM material_categories parent
    WHERE parent.parent_id IS NULL
      AND EXISTS (
        SELECT 1 FROM price_rates rate
        WHERE rate.category_id = parent.id AND rate.is_active IS TRUE
      );
  SELECT count(*) INTO v_trigger
    FROM pg_trigger
    WHERE tgrelid = 'scrap_listings'::regclass
      AND tgname = 'scrap_listings_catalogue_reference'
      AND NOT tgisinternal;

  IF v_total <> 26 OR v_parents <> 5 OR v_subcategories <> 21 THEN
    RAISE EXCEPTION 'catalogue shape: expected 26 rows (5 parents, 21 subcategories), got % / % / %',
      v_total, v_parents, v_subcategories;
  END IF;
  IF v_orphans <> 0 OR v_bad_flags <> 0 THEN
    RAISE EXCEPTION 'catalogue hierarchy is invalid: % orphans, % bad flags', v_orphans, v_bad_flags;
  END IF;
  IF v_duplicate_parents <> 0 OR v_duplicate_subcategories <> 0 THEN
    RAISE EXCEPTION 'catalogue contains duplicates: % parents, % subcategories',
      v_duplicate_parents, v_duplicate_subcategories;
  END IF;
  IF v_active_rates <> 5 OR v_expected_rates <> 5 THEN
    RAISE EXCEPTION 'expected one active rate per parent category, saw % rates / % covered parents',
      v_active_rates, v_expected_rates;
  END IF;
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'scrap_listings_catalogue_reference trigger is missing';
  END IF;
END $$;

-- RLS: authenticated consumers can read categories but cannot manage them ---
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ffffffff-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM material_categories;
  IF n <> 26 THEN RAISE EXCEPTION 'consumer cannot read all 26 catalogue rows, saw %', n; END IF;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO material_categories (name) VALUES ('Validation must not be writable');
    RAISE EXCEPTION 'non-admin category insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'non-admin category insert unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
COMMIT;

-- Listing submission: valid IDs accepted, mismatched IDs rejected -----------
DELETE FROM scrap_listings WHERE consumer_id = 'ffffffff-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id = 'ffffffff-0000-4000-8000-000000000001';

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'catalogue-validation@test.local',
  crypt('x', gen_salt('bf')), now(), now(), now(), '{}',
  '{"full_name":"Catalogue Validation"}'
);

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM profiles WHERE id = 'ffffffff-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'signup trigger did not create the validation profile'; END IF;
END $$;

INSERT INTO scrap_listings (
  consumer_id, category_id, subcategory_id, approximate_weight, condition, status
) VALUES (
  'ffffffff-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000101',
  2, 'Used', 'LISTED'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO scrap_listings (
      consumer_id, category_id, subcategory_id, approximate_weight, condition, status
    ) VALUES (
      'ffffffff-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000201',
      2, 'Used', 'LISTED'
    );
    RAISE EXCEPTION 'mismatched subcategory unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'mismatched subcategory unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO scrap_listings (
      consumer_id, category_id, subcategory_id, approximate_weight, condition, status
    ) VALUES (
      'ffffffff-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000101',
      NULL,
      2, 'Used', 'LISTED'
    );
    RAISE EXCEPTION 'subcategory used as parent category unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'subcategory used as parent category unexpectedly accepted' THEN RAISE; END IF;
  END;
END $$;

DELETE FROM scrap_listings WHERE consumer_id = 'ffffffff-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id = 'ffffffff-0000-4000-8000-000000000001';

DO $$ BEGIN RAISE NOTICE 'CATALOGUE VALIDATION: ALL CHECKS PASSED'; END $$;
