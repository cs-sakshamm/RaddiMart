-- Catalogue bootstrap for every environment
--
-- supabase/seed.sql is local-only: Supabase never applies it to a hosted
-- project. The New Listing page therefore sees an empty material_categories
-- table in production even though local development has the full catalogue.
--
-- This additive, forward-only migration installs the same administrator-managed
-- taxonomy and indicative rate cards using the stable IDs from seed.sql.
-- Existing rows are never overwritten: id conflicts are skipped, and duplicate
-- names are skipped so an existing admin-managed taxonomy is preserved.

BEGIN;

-- Parent categories ---------------------------------------------------------
WITH catalogue(id, name, description) AS (
  VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'E-waste', 'Electronic waste'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 'Metals', 'Ferrous and non-ferrous metals'),
    ('a1000000-0000-4000-8000-000000000003'::uuid, 'Plastics', 'Plastic scrap'),
    ('a1000000-0000-4000-8000-000000000004'::uuid, 'Paper', 'Paper and cardboard'),
    ('a1000000-0000-4000-8000-000000000005'::uuid, 'Other', 'Glass, rubber and miscellaneous scrap')
)
INSERT INTO material_categories (id, name, parent_id, is_subcategory, description)
SELECT catalogue.id, catalogue.name, NULL, FALSE, catalogue.description
FROM catalogue
WHERE NOT EXISTS (
  SELECT 1
  FROM material_categories existing
  WHERE existing.parent_id IS NULL
    AND existing.name = catalogue.name
)
ON CONFLICT (id) DO NOTHING;

-- Subcategories -------------------------------------------------------------
WITH catalogue(id, name, parent_id) AS (
  VALUES
    ('a1000000-0000-4000-8000-000000000101'::uuid, 'PCBs', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000102'::uuid, 'Cables and wires', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000103'::uuid, 'LCD panels', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000104'::uuid, 'CRT monitors', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000105'::uuid, 'Batteries', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000106'::uuid, 'Motors and magnet-bearing assemblies', 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000107'::uuid, 'Mixed electronic components', 'a1000000-0000-4000-8000-000000000001'::uuid),

    ('a1000000-0000-4000-8000-000000000201'::uuid, 'Copper', 'a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000202'::uuid, 'Aluminium', 'a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000203'::uuid, 'Iron', 'a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000204'::uuid, 'Steel', 'a1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000205'::uuid, 'Brass', 'a1000000-0000-4000-8000-000000000002'::uuid),

    ('a1000000-0000-4000-8000-000000000301'::uuid, 'Hard plastic', 'a1000000-0000-4000-8000-000000000003'::uuid),
    ('a1000000-0000-4000-8000-000000000302'::uuid, 'Mixed plastic', 'a1000000-0000-4000-8000-000000000003'::uuid),
    ('a1000000-0000-4000-8000-000000000303'::uuid, 'PET bottles', 'a1000000-0000-4000-8000-000000000003'::uuid),

    ('a1000000-0000-4000-8000-000000000401'::uuid, 'Newspapers', 'a1000000-0000-4000-8000-000000000004'::uuid),
    ('a1000000-0000-4000-8000-000000000402'::uuid, 'Cardboard', 'a1000000-0000-4000-8000-000000000004'::uuid),
    ('a1000000-0000-4000-8000-000000000403'::uuid, 'Office paper', 'a1000000-0000-4000-8000-000000000004'::uuid),

    ('a1000000-0000-4000-8000-000000000501'::uuid, 'Glass', 'a1000000-0000-4000-8000-000000000005'::uuid),
    ('a1000000-0000-4000-8000-000000000502'::uuid, 'Rubber', 'a1000000-0000-4000-8000-000000000005'::uuid),
    ('a1000000-0000-4000-8000-000000000503'::uuid, 'Miscellaneous', 'a1000000-0000-4000-8000-000000000005'::uuid)
)
INSERT INTO material_categories (id, name, parent_id, is_subcategory, description)
SELECT catalogue.id, catalogue.name, catalogue.parent_id, TRUE, NULL
FROM catalogue
WHERE EXISTS (
  SELECT 1
  FROM material_categories parent
  WHERE parent.id = catalogue.parent_id
    AND parent.parent_id IS NULL
)
  AND NOT EXISTS (
    SELECT 1
    FROM material_categories existing
    WHERE existing.name = catalogue.name
      AND existing.parent_id IS NOT DISTINCT FROM catalogue.parent_id
  )
ON CONFLICT (id) DO NOTHING;

-- Indicative rate cards -----------------------------------------------------
-- These are the documented local defaults. Administrators can change them;
-- this migration never adds a second active rate for a category.
WITH rates(id, category_id, rate_per_kg) AS (
  VALUES
    ('b1000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid, 28.00::numeric),
    ('b1000000-0000-4000-8000-000000000002'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid, 42.00::numeric),
    ('b1000000-0000-4000-8000-000000000003'::uuid, 'a1000000-0000-4000-8000-000000000003'::uuid, 14.00::numeric),
    ('b1000000-0000-4000-8000-000000000004'::uuid, 'a1000000-0000-4000-8000-000000000004'::uuid,  9.00::numeric),
    ('b1000000-0000-4000-8000-000000000005'::uuid, 'a1000000-0000-4000-8000-000000000005'::uuid,  5.00::numeric)
)
INSERT INTO price_rates (id, category_id, rate_per_kg, unit, is_active)
SELECT rates.id, rates.category_id, rates.rate_per_kg, 'kg', TRUE
FROM rates
WHERE EXISTS (
  SELECT 1 FROM material_categories category WHERE category.id = rates.category_id
)
  AND NOT EXISTS (
    SELECT 1
    FROM price_rates existing
    WHERE existing.category_id = rates.category_id
      AND existing.is_active IS TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- Listing catalogue integrity ----------------------------------------------
-- The selectors only offer valid IDs. This guard keeps that guarantee even if
-- a stale form, a direct API call or a future client submits mismatched IDs.
CREATE OR REPLACE FUNCTION public.validate_listing_catalogue_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Administrators may repair historical records through the admin policies.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'A material category is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM material_categories category
    WHERE category.id = NEW.category_id
      AND category.parent_id IS NULL
      AND COALESCE(category.is_subcategory, FALSE) = FALSE
  ) THEN
    RAISE EXCEPTION 'Invalid material category';
  END IF;

  IF NEW.subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM material_categories subcategory
    WHERE subcategory.id = NEW.subcategory_id
      AND subcategory.parent_id = NEW.category_id
      AND COALESCE(subcategory.is_subcategory, FALSE) = TRUE
  ) THEN
    RAISE EXCEPTION 'The subcategory does not belong to the selected material category';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scrap_listings_catalogue_reference ON scrap_listings;
CREATE TRIGGER scrap_listings_catalogue_reference
  BEFORE INSERT OR UPDATE ON scrap_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_listing_catalogue_reference();

COMMIT;
