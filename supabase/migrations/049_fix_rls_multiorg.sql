-- Migration 049: Fix multi-org RLS helper functions
--
-- Problem: get_user_organization_id() and get_user_role() use LIMIT 1 with no
-- ORDER BY — non-deterministic for users who belong to more than one organization.
-- If a user is in 2 orgs, Postgres can return either one, causing RLS to scope
-- all queries to the wrong org.
--
-- Fix:
--   1. Check the x-org-id request header first (set by the app when a specific
--      org is selected). Verify the user actually belongs to it before trusting it.
--   2. Fall back to ORDER BY joined_at ASC LIMIT 1 — deterministic for single-org
--      users instead of random.
--   get_user_role() reuses get_user_organization_id() so org resolution stays in
--   one place.
--
-- Zero data changes. Fully backward compatible — single-org users are unaffected.

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_org_id  uuid;
  v_header  text;
BEGIN
  v_user_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- 1. App-supplied org header (multi-org users with an explicitly selected org)
  BEGIN
    v_header := nullif(current_setting('request.headers', true), '')::json->>'x-org-id';
  EXCEPTION WHEN OTHERS THEN
    v_header := NULL;
  END;

  IF v_header IS NOT NULL THEN
    -- Security: verify the user actually belongs to this org before trusting it
    SELECT organization_id INTO v_org_id
    FROM organization_users
    WHERE user_id        = v_user_id
      AND organization_id = v_header::uuid
      AND is_active       = true;
    IF FOUND THEN RETURN v_org_id; END IF;
  END IF;

  -- 2. Fallback: earliest membership — deterministic, not random
  SELECT organization_id INTO v_org_id
  FROM organization_users
  WHERE user_id   = v_user_id
    AND is_active = true
  ORDER BY joined_at ASC
  LIMIT 1;

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_org_id  uuid;
  v_role    text;
BEGIN
  v_user_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- Reuse the same org resolution so both functions always agree on which org
  v_org_id := get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO v_role
  FROM organization_users
  WHERE user_id        = v_user_id
    AND organization_id = v_org_id
    AND is_active       = true;

  RETURN v_role;
END;
$$;
