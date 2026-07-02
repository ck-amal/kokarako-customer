-- Remove business_name from organizations — org name is the single canonical name.

ALTER TABLE organizations DROP COLUMN IF EXISTS business_name;

-- Recreate create_organization without the p_business_name parameter.
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text, text);
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text);

CREATE FUNCTION create_organization(
  p_name          text,
  p_user_id       uuid,
  p_phone         text    DEFAULT NULL,
  p_plan_key      text    DEFAULT 'free',
  p_billing_period text   DEFAULT 'monthly'
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
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text) TO authenticated;
