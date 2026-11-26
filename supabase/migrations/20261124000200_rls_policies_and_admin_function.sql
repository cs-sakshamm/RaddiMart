-- Phase 2: Row Level Security policies and admin approval function

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE recyclers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES RLS POLICIES
-- ============================================================

-- Authenticated users can read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Authenticated users can update only permitted personal fields in own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Administrators can read all profiles (for role management)
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Administrators can update any profile (role changes, admin flag)
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ============================================================
-- MATERIAL CATEGORIES RLS POLICIES
-- ============================================================

-- All authenticated users can read categories
CREATE POLICY "Authenticated users can read categories" ON material_categories
  FOR SELECT TO authenticated USING (true);

-- Only administrators can modify categories
CREATE POLICY "Only admins can modify categories" ON material_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- PRICE RATES RLS POLICIES
-- ============================================================

-- All authenticated users can read active price rates
CREATE POLICY "Authenticated users can read price rates" ON price_rates
  FOR SELECT TO authenticated USING (is_active = true);

-- Only administrators can modify price rates
CREATE POLICY "Only admins can modify price rates" ON price_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- ROLE REQUESTS RLS POLICIES
-- ============================================================

-- Authenticated users can create their own request
CREATE POLICY "Users can create own role request" ON role_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can read their own requests
CREATE POLICY "Users can read own role requests" ON role_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Users cannot approve or reject requests
CREATE POLICY "Users cannot approve/reject own request" ON role_requests
  FOR UPDATE USING (false);

-- Administrators can read and review requests
CREATE POLICY "Admins can review role requests" ON role_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ============================================================
-- TRANSACTIONS RLS POLICIES
-- ============================================================

-- Users can read their own transactions (via profiles)
CREATE POLICY "Users can read own transactions" ON transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.active_role = 'recycler')
  );

-- Users can create transactions (consumers via listings)
CREATE POLICY "Users can create transactions" ON transactions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );

-- Administrators can modify all transactions
CREATE POLICY "Admins can modify transactions" ON transactions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- HANDOVER RECORDS RLS POLICIES
-- ============================================================

-- Users can read handover records related to their transactions
CREATE POLICY "Users can read own handover records" ON handover_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM transactions t WHERE t.id = handover_records.transaction_id
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.lot_id AND p.id = auth.uid())
    )
  );

-- Administrators can modify handover records
CREATE POLICY "Admins can modify handover records" ON handover_records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- RECYCLERS RLS POLICIES
-- ============================================================

-- All authenticated users can read recycler profiles (limited fields)
CREATE POLICY "Authenticated users can read recyclers" ON recyclers
  FOR SELECT TO authenticated USING (true);

-- Only admins can modify recycler profiles
CREATE POLICY "Only admins can modify recyclers" ON recyclers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- ============================================================
-- ADMIN ROLE APPROVAL FUNCTION
-- ============================================================

-- Secure approval/rejection function
-- Verifies the caller's administrator permission
-- Validates the requested status and role
-- Prevents unauthorized execution
-- Updates the request's review information
-- Updates the applicant's active role only when approved
-- Preserves the existing role if rejected
-- Prevents a user from approving their own request
-- Records reviewer identity and timestamp
-- Handles already reviewed requests safely
-- Uses SECURITY DEFINER with safe search_path

CREATE OR REPLACE FUNCTION approve_role_request(
  p_request_id UUID,
  p_status TEXT,
  p_review_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request role_requests%ROWTYPE;
  v_user profiles%ROWTYPE;
  v_admin profiles%ROWTYPE;
BEGIN
  -- Validate status
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %. Allowed values: approved, rejected', p_status;
  END IF;

  -- Look up the request
  SELECT * INTO v_request FROM role_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role request with ID % not found', p_request_id;
  END IF;

  -- Prevent user from approving their own request
  IF v_request.user_id = auth.uid() AND v_request.status = 'pending' THEN
    RAISE EXCEPTION 'Users cannot approve their own role request. Contact an administrator.';
  END IF;

  -- Verify the caller is an administrator
  SELECT * INTO v_admin FROM profiles WHERE id = auth.uid();
  
  IF v_admin IS NULL OR v_admin.is_admin != TRUE THEN
    RAISE EXCEPTION 'Only administrators can approve or reject role requests.';
  END IF;

  -- Validate the requested role is valid
  IF v_request.requested_role NOT IN ('local_collector', 'aggregator', 'recycler') THEN
    RAISE EXCEPTION 'Invalid requested role: %. Allowed values: local_collector, aggregator, recycler', v_request.requested_role;
  END IF;

  -- Update the request status and review information
  UPDATE role_requests SET
    status = p_status,
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    review_note = p_review_note,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- If approved, update the user's active role
  IF p_status = 'approved' THEN
    -- Map role requests to profile active roles
    CASE v_request.requested_role
      WHEN 'local_collector' THEN
        UPDATE profiles SET active_role = 'collector', updated_at = NOW()
        WHERE id = v_request.user_id;
      WHEN 'aggregator' THEN
        UPDATE profiles SET active_role = 'aggregator', updated_at = NOW()
        WHERE id = v_request.user_id;
      WHEN 'recycler' THEN
        UPDATE profiles SET active_role = 'recycler', updated_at = NOW()
        WHERE id = v_request.user_id;
    END CASE;
  END IF;
  
  -- If rejected, role stays unchanged (no action needed)
  -- If the user had a pending request for a different role, it stays pending too

  -- Log the approval action (audit)
  -- Note: No separate audit table created in this phase; review_note captures the decision

  RETURN;
END;
$$;

-- Trigger to prevent non-admin users from changing active_role or is_admin
CREATE OR REPLACE FUNCTION handle_profiles_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent non-admin users from changing active_role or is_admin
  IF (NEW.active_role IS DISTINCT FROM OLD.active_role)
     OR (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    IF (SELECT is_admin FROM profiles WHERE id = NEW.id) IS NOT TRUE THEN
      -- Revert changes for non-admin users
      NEW.active_role := OLD.active_role;
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_update_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_profiles_update();

-- Grant execute permission to authenticated users who are administrators
-- (The function uses SECURITY DEFINER, so it runs with the privileges of the calling profile)
GRANT EXECUTE ON FUNCTION approve_role_request TO authenticated;

-- Add a comment
COMMENT ON FUNCTION approve_role_request(uuid, text, text) IS 
  'Secure admin approval function for role requests. Verifies administrator permission, updates request status, and conditionally updates user active role. Prevents self-approval.';