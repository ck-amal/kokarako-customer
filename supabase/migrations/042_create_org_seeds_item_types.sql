-- Migration 042: Fix create_organization to seed system item types
--
-- The original function (migration 019) never called seed_system_item_types.
-- This replaces it so every new org automatically gets Feed, Medicine, and Chick.

DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text);
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text, text);
DROP FUNCTION IF EXISTS create_organization(text, uuid);

CREATE OR REPLACE FUNCTION create_organization(
  p_name    text,
  p_user_id uuid,
  p_phone   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  INSERT INTO organizations (name, phone)
  VALUES (p_name, NULLIF(p_phone, ''))
  RETURNING id INTO v_org_id;

  INSERT INTO organization_users (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  -- Seed Feed, Medicine, and Chick item types for the new org
  PERFORM seed_system_item_types(v_org_id);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text) TO authenticated;
