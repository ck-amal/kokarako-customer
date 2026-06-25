-- Migration 018: Fix RLS bootstrap policies
--
-- Problem:
--   1. `organizations` had no INSERT policy → authenticated users couldn't create an org.
--   2. `organization_users` INSERT policy required get_user_role() = 'owner' → new users
--      with no org yet can never insert their first membership row (deadlock).
--
-- Fix:
--   1. Allow any authenticated user to INSERT into organizations.
--   2. Allow any authenticated user to INSERT their OWN row into organization_users
--      (user_id must equal auth.uid() — you can only add yourself).
--      Owners can still manage members via invitations; the org_users insert
--      only ever happens when a user accepts an invitation or creates a new org.

-- ── 1. Allow authenticated users to create organizations ─────────────────────
CREATE POLICY "org_insert" ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── 2. Fix organization_users INSERT — allow self-insert only ────────────────
DROP POLICY IF EXISTS "ou_insert" ON organization_users;

CREATE POLICY "ou_insert" ON organization_users
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Note: The restriction that only owners can invite members is enforced at the
-- application layer (TeamSettings is owner-only, invitations INSERT requires owner role).
-- The DB ensures you can only add YOURSELF to an org — not others.
