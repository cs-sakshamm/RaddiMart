-- RADDIMART — local development seed
--
-- Supabase applies this file only on `supabase db reset` / local startup.
-- It is NEVER applied to a remote project by `supabase db push`.
--
-- It contains the administrator-managed catalogue (material categories and
-- indicative rate cards) that the marketplace needs in order to function.
-- The rate values are local development defaults only; they are not a claim
-- about real market prices and must be replaced by an administrator in any
-- non-development environment.
--
-- No user accounts or listings are seeded here. Test fixtures are created by
-- the test suites.

-- Material categories and subcategories -------------------------------------
INSERT INTO material_categories (id, name, parent_id, is_subcategory, description) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'E-waste', NULL, FALSE, 'Electronic waste'),
  ('a1000000-0000-4000-8000-000000000002', 'Metals', NULL, FALSE, 'Ferrous and non-ferrous metals'),
  ('a1000000-0000-4000-8000-000000000003', 'Plastics', NULL, FALSE, 'Plastic scrap'),
  ('a1000000-0000-4000-8000-000000000004', 'Paper', NULL, FALSE, 'Paper and cardboard'),
  ('a1000000-0000-4000-8000-000000000005', 'Other', NULL, FALSE, 'Glass, rubber and miscellaneous scrap'),

  ('a1000000-0000-4000-8000-000000000101', 'PCBs', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000102', 'Cables and wires', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000103', 'LCD panels', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000104', 'CRT monitors', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000105', 'Batteries', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000106', 'Motors and magnet-bearing assemblies', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000107', 'Mixed electronic components', 'a1000000-0000-4000-8000-000000000001', TRUE, NULL),

  ('a1000000-0000-4000-8000-000000000201', 'Copper', 'a1000000-0000-4000-8000-000000000002', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000202', 'Aluminium', 'a1000000-0000-4000-8000-000000000002', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000203', 'Iron', 'a1000000-0000-4000-8000-000000000002', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000204', 'Steel', 'a1000000-0000-4000-8000-000000000002', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000205', 'Brass', 'a1000000-0000-4000-8000-000000000002', TRUE, NULL),

  ('a1000000-0000-4000-8000-000000000301', 'Hard plastic', 'a1000000-0000-4000-8000-000000000003', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000302', 'Mixed plastic', 'a1000000-0000-4000-8000-000000000003', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000303', 'PET bottles', 'a1000000-0000-4000-8000-000000000003', TRUE, NULL),

  ('a1000000-0000-4000-8000-000000000401', 'Newspapers', 'a1000000-0000-4000-8000-000000000004', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000402', 'Cardboard', 'a1000000-0000-4000-8000-000000000004', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000403', 'Office paper', 'a1000000-0000-4000-8000-000000000004', TRUE, NULL),

  ('a1000000-0000-4000-8000-000000000501', 'Glass', 'a1000000-0000-4000-8000-000000000005', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000502', 'Rubber', 'a1000000-0000-4000-8000-000000000005', TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000503', 'Miscellaneous', 'a1000000-0000-4000-8000-000000000005', TRUE, NULL)
ON CONFLICT (id) DO NOTHING;

-- Indicative rate cards (local development defaults) ------------------------
INSERT INTO price_rates (id, category_id, rate_per_kg, unit, is_active) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 28.00, 'kg', TRUE),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 42.00, 'kg', TRUE),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 14.00, 'kg', TRUE),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004',  9.00, 'kg', TRUE),
  ('b1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005',  5.00, 'kg', TRUE)
ON CONFLICT (id) DO NOTHING;
