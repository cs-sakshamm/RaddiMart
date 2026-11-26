-- Phase 2: Scrap listings and remaining tables
-- This migration creates the scrap_listings table and the partial unique index
-- for role request deduplication. material_lots is created in migration 001.

-- ============================================================
-- SCRAP LISTINGS TABLE
-- ============================================================

-- Consumer listings and pickup requests
-- consumer_id references profiles; optional collector_id
-- category_id references material_categories
-- Stores estimated/actual weight, condition, pickup details, optional photo path and status
-- Owned by the consumer; assigned collector may read/update
CREATE TABLE IF NOT EXISTS scrap_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  collector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category_id UUID REFERENCES material_categories(id) ON DELETE SET NULL,
  approximate_weight NUMERIC(10, 2),
  actual_weight NUMERIC(10, 2),
  condition TEXT,
  pickup_location TEXT,
  pickup_zone TEXT,
  preferred_pickup_time TIMESTAMP WITH TIME ZONE,
  photo_path TEXT, -- Optional path to uploaded photo in Storage
  status TEXT DEFAULT 'LISTED' CHECK (status IN ('LISTED', 'PICKUP_REQUESTED', 'ACCEPTED', 'COLLECTED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scrap_listings
CREATE INDEX IF NOT EXISTS idx_scrap_listings_consumer ON scrap_listings(consumer_id);
CREATE INDEX IF NOT EXISTS idx_scrap_listings_collector ON scrap_listings(collector_id);
CREATE INDEX IF NOT EXISTS idx_scrap_listings_category ON scrap_listings(category_id);
CREATE INDEX IF NOT EXISTS idx_scrap_listings_status ON scrap_listings(status);
CREATE INDEX IF NOT EXISTS idx_scrap_listings_created ON scrap_listings(created_at DESC);

-- ============================================================
-- ROLE REQUEST DEDUPLICATION INDEX
-- ============================================================

-- Partial unique index to prevent duplicate pending requests per user per role
-- Enforces: one pending request per user per requested_role
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_requests_one_pending_per_user_role
ON public.role_requests (user_id, requested_role)
WHERE status = 'pending';

-- ==========================================================--
-- ROLES AND CONSTRAINTS COMMENT
-- ============================================================

-- Role identifiers standardized:
-- - profiles.active_role: 'consumer', 'collector', 'aggregator', 'recycler'
-- - role_requests.requested_role: 'local_collector', 'aggregator', 'recycler'
-- - Mapping in approve_role_request(): local_collector -> collector, aggregator -> aggregator, recycler -> recycler

COMMENT ON TABLE scrap_listings IS 'Consumer listings and pickup requests. Owned by consumer; assigned collector may read/update. Category references material_categories.';

-- Note on role identifiers: The internal role identifier used in role requests is "local_collector",
-- which maps to "collector" in the profile's active_role. This separation allows the request workflow
-- to use descriptive names while maintaining clean profile role values.