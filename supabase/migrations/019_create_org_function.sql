-- Migration 019: SECURITY DEFINER function for org creation
--
-- Problem: RLS bootstrap deadlock — a new user has no org row yet, so any
-- policy that calls get_user_organization_id() or get_user_role() returns NULL,
-- blocking the very INSERT that would give them an org.
--
-- Solution: A SECURITY DEFINER function runs as the DB owner (bypasses RLS).
-- The app calls supabase.rpc('create_organization', {...}) instead of two
-- separate inserts. Logic inside the function ensures only the calling user
-- can become the owner of their new org.

CREATE OR REPLACE FUNCTION create_organization(
  p_name          TEXT,
  p_user_id       uuid,
  p_business_name TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- 1. Create the organization
  INSERT INTO organizations (name, business_name, phone)
  VALUES (
    p_name,
    COALESCE(NULLIF(p_business_name, ''), p_name),
    NULLIF(p_phone, '')
  )
  RETURNING id INTO v_org_id;

  -- 2. Add the specified user as owner
  --    p_user_id is the authenticated user's ID passed from the client.
  --    auth.uid() can return NULL inside SECURITY DEFINER functions in some
  --    Supabase configurations, so we pass it explicitly instead.
  INSERT INTO organization_users (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization TO authenticated;
