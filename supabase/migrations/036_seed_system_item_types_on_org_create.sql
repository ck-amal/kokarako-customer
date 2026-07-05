-- Migration 036: Auto-seed Feed + Medicine system item types on org creation
--
-- Every new org gets Feed and Medicine in their item catalog automatically.
-- Existing orgs that are missing either type also get them backfilled.
-- These types are marked is_system=true (set in migration 035), so they
-- cannot be edited or deleted from the catalog UI.

-- ── Helper: seed system item types for one org ────────────────────────────────

CREATE OR REPLACE FUNCTION seed_system_item_types(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert Feed if not already present (case-insensitive)
  IF NOT EXISTS (
    SELECT 1 FROM item_types
    WHERE organization_id = p_org_id AND LOWER(name) = 'feed'
  ) THEN
    INSERT INTO item_types (organization_id, name, description, is_distributable, is_system)
    VALUES (p_org_id, 'Feed', 'Animal feed for daily distribution', true, true);
  ELSE
    -- Ensure existing Feed is marked as system
    UPDATE item_types
    SET is_system = true
    WHERE organization_id = p_org_id AND LOWER(name) = 'feed';
  END IF;

  -- Insert Medicine if not already present (case-insensitive)
  IF NOT EXISTS (
    SELECT 1 FROM item_types
    WHERE organization_id = p_org_id AND LOWER(name) = 'medicine'
  ) THEN
    INSERT INTO item_types (organization_id, name, description, is_distributable, is_system)
    VALUES (p_org_id, 'Medicine', 'Medicines and health supplements', true, true);
  ELSE
    -- Ensure existing Medicine is marked as system
    UPDATE item_types
    SET is_system = true
    WHERE organization_id = p_org_id AND LOWER(name) = 'medicine';
  END IF;
END;
$$;

-- ── Backfill existing orgs ────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM organizations LOOP
    PERFORM seed_system_item_types(r.id);
  END LOOP;
END;
$$;

-- ── Recreate create_organization to seed system types ────────────────────────

DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text, text);

CREATE FUNCTION create_organization(
  p_name           text,
  p_user_id        uuid,
  p_phone          text    DEFAULT NULL,
  p_plan_key       text    DEFAULT 'free',
  p_billing_period text    DEFAULT 'monthly'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_plan   text := COALESCE(NULLIF(p_plan_key, ''), 'free');
  v_period text := COALESCE(NULLIF(p_billing_period, ''), 'monthly');
BEGIN
  INSERT INTO organizations (name, phone, subscription_plan, billing_period)
  VALUES (p_name, NULLIF(p_phone, ''), v_plan, v_period)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'owner');

  -- Seed the two system item types every new org needs
  PERFORM seed_system_item_types(v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION seed_system_item_types(uuid) TO authenticated;
