-- Phase 2: Create profiles table and core catalogue tables
-- This migration creates the foundational schema for RADDIMART authentication and role management

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles table - user identities and role assignments
-- One row per authenticated user, linked to auth.users.id
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  active_role TEXT DEFAULT 'consumer' CHECK (active_role IN ('consumer', 'collector', 'aggregator', 'recycler')),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Material categories table - manual category and subcategory catalogue
-- Administrator-managed; referenced by listings and lots
CREATE TABLE IF NOT EXISTS material_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES material_categories(id),
  description TEXT,
  is_subcategory BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Price rates table - administrator-maintained indicative rates
-- category_id references material_categories; includes rate per kg, unit and update timestamp
-- Not writable by ordinary users
CREATE TABLE IF NOT EXISTS price_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES material_categories(id) ON DELETE SET NULL,
  rate_per_kg NUMERIC(10, 2) NOT NULL,
  unit TEXT DEFAULT 'kg',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Recycler profiles table - facility profiles and accepted categories
-- profile_id references profiles; stores facility name, location, accepted categories and verification status
CREATE TABLE IF NOT EXISTS recyclers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  facility_name TEXT NOT NULL,
  location TEXT,
  accepted_categories TEXT[], -- JSON array of category names or IDs
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  contact_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Role requests table - stakeholder access request workflow
-- Users can request access as local_collector, aggregator, or recycler
-- After submission: saved in Supabase, status shown, applicant can view own request
-- Cannot approve own request; active role unchanged until approval
-- Pending, approved, or rejected state displayed
CREATE TABLE IF NOT EXISTS role_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('local_collector', 'aggregator', 'recycler')),
  applicant_name TEXT,
  organization_name TEXT,
  phone TEXT,
  city_or_operating_area TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Material lots table - structured lots created after collection
-- References collector, aggregator and category; unique lot code
-- Created before transactions to ensure dependency order
CREATE TABLE IF NOT EXISTS material_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_code UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  collector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  aggregator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category_id UUID REFERENCES material_categories(id) ON DELETE SET NULL,
  approximate_weight NUMERIC(10, 2),
  actual_weight NUMERIC(10, 2),
  condition TEXT,
  pickup_location TEXT,
  pickup_zone TEXT,
  requested_pickup_time TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'LISTED' CHECK (status IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Transactions table - offers, rates, lifecycle and payment status
-- Unique tx_reference; lot_id references material_lots; recycler_id references recyclers
-- Stores offered rate, final value, transaction status and independent payment status
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tx_reference UUID UNIQUE DEFAULT uuid_generate_v4(),
  lot_id UUID REFERENCES material_lots(id) ON DELETE SET NULL,
  recycler_id UUID REFERENCES recyclers(id) ON DELETE SET NULL,
  offered_rate NUMERIC(10, 2),
  final_value NUMERIC(12, 2),
  status TEXT DEFAULT 'LISTED' CHECK (status IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED', 'IN_AGGREGATOR_INVENTORY', 'OFFERED_TO_RECYCLER', 'ACCEPTED_BY_RECYCLER', 'HANDOVER_CONFIRMED', 'COMPLETED')),
  payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Handover records table - digital custody confirmation and QR token
-- transaction_id references transactions; unique QR token/verification reference
-- Stores handover timestamp, recycler confirmation and received weight
CREATE TABLE IF NOT EXISTS handover_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  qr_token UUID UNIQUE DEFAULT uuid_generate_v4(),
  handover_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recycler_confirmation BOOLEAN DEFAULT FALSE,
  received_weight NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Indexes for performance and RLS
CREATE INDEX IF NOT EXISTS idx_profiles_active_role ON profiles(active_role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin);
CREATE INDEX IF NOT EXISTS idx_material_categories_parent ON material_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_price_rates_category ON price_rates(category_id);
CREATE INDEX IF NOT EXISTS idx_recyclers_profile ON recyclers(profile_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_user ON role_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status);
CREATE INDEX IF NOT EXISTS idx_transactions_lot ON transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recycler ON transactions(recycler_id);
CREATE INDEX IF NOT EXISTS idx_handover_records_transaction ON handover_records(transaction_id);
CREATE INDEX IF NOT EXISTS idx_handover_records_qr ON handover_records(qr_token);

-- 10. Comment documentation
COMMENT ON TABLE profiles IS 'User identities and role assignments. One row per authenticated user, linked to auth.users.id.';
COMMENT ON TABLE material_categories IS 'Manual category and subcategory catalogue. Administrator-managed; referenced by listings and lots.';
COMMENT ON TABLE price_rates IS 'Administrator-maintained indicative rates. rate per kg, unit, not writable by ordinary users.';
COMMENT ON TABLE role_requests IS 'Stakeholder access request workflow. Users can request local_collector, aggregator, or recycler roles. Status: pending/approved/rejected. Admin approval required.';
COMMENT ON TABLE transactions IS 'Offers, rates, lifecycle and payment status. Unique tx_reference; independent payment status from handover completion.';
COMMENT ON TABLE handover_records IS 'Digital custody confirmation and QR token. Unique QR token; handover timestamp, recycler confirmation, received weight.';