-- Migration 020: Fix get_user_organization_id() and get_user_role()
--
-- Problem: auth.uid() returns NULL inside SECURITY DEFINER functions in some
-- Supabase configurations. These helpers are called by every RLS policy, so
-- all policies evaluate to FALSE, blocking all table access.
--
-- Fix: Inline the JWT claim reading using current_setting() directly instead
-- of calling auth.uid(). current_setting('request.jwt.claims') is a session-
-- level GUC set by PostgREST and IS accessible inside SECURITY DEFINER.

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM organization_users
  WHERE user_id = (
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
  )::uuid
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM organization_users
  WHERE user_id = (
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
  )::uuid
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_user_organization_id TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_role TO authenticated, anon;
