-- Migration 048: Fix invitation RLS — replace open USING(true) policy with a
-- SECURITY DEFINER lookup function + org-scoped SELECT policy.
--
-- Problem: "inv_read_by_token" had USING(true), meaning any authenticated user
-- could read ALL invitations across every organization (including email addresses).
--
-- Fix:
--   1. lookup_invitation_by_token(token) — SECURITY DEFINER function that returns
--      only the single invitation matching the given token. App calls this RPC
--      instead of querying the table directly.
--   2. Drop the open USING(true) policy.
--   3. Add org-scoped SELECT policy so org members can list their own invitations
--      (used by TeamSettings to show pending invites).
--
-- Zero data changes. Safe to run on live DB.

-- 1. Secure token lookup function
CREATE OR REPLACE FUNCTION lookup_invitation_by_token(p_token text)
RETURNS TABLE (
  id              uuid,
  organization_id uuid,
  org_name        text,
  role            text,
  email           text,
  expires_at      timestamptz,
  accepted_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.organization_id,
    o.name AS org_name,
    i.role,
    i.email,
    i.expires_at,
    i.accepted_at
  FROM invitations i
  JOIN organizations o ON o.id = i.organization_id
  WHERE i.token = p_token;
END;
$$;

-- Allow both unauthenticated (new user clicking link) and authenticated users
-- to call this function. The function itself returns nothing if the token is wrong.
GRANT EXECUTE ON FUNCTION lookup_invitation_by_token(text) TO anon, authenticated;

-- 2. Drop the open policy
DROP POLICY IF EXISTS "inv_read_by_token" ON invitations;

-- 3. Org-scoped SELECT for authenticated org members (TeamSettings invite list)
DROP POLICY IF EXISTS "inv_select_org" ON invitations;
CREATE POLICY "inv_select_org" ON invitations FOR SELECT
  USING (organization_id = get_user_organization_id());
