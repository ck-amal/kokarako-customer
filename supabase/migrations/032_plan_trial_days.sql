-- Move free-trial configuration from a global app_settings table to per-plan
-- trial_period_days. trial_ends_at on organizations is still stamped by the
-- razorpay-create-subscription edge function when a user subscribes.

-- Drop app_settings (replaced by per-plan config)
DROP TABLE IF EXISTS app_settings;

-- Add trial_period_days to plans (0 = no trial)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_period_days INT NOT NULL DEFAULT 0;

-- Revert create_organization to a simple insert; trial_ends_at is now set
-- by the subscription edge function when the user chooses a paid plan.
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
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text) TO authenticated;
