-- ============================================================================
-- Migration 024 — Yearly billing option for plans
-- Run after 023 on the project the app + admin share (target: khbuypzugydxvejjcoam).
-- ============================================================================

-- 1. Yearly price on each plan (total annual price; set cheaper than 12× monthly).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_yearly numeric NOT NULL DEFAULT 0;

-- Sensible default for existing paid plans: 10 months' price (~2 months free).
-- Only fills rows that don't have a yearly price yet; admins can edit afterwards.
UPDATE plans SET price_yearly = round(price_monthly * 10)
WHERE price_yearly = 0 AND price_monthly > 0;

-- 2. Track the org's chosen billing period.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'organizations' AND constraint_name = 'organizations_billing_period_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_billing_period_check CHECK (billing_period IN ('monthly','yearly'));
  END IF;
END $$;

-- 3. create_organization now records the billing period. Collapse prior overloads
--    (4-arg from 019, 5-arg from 023) into one 6-arg function with safe defaults.
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text);
DROP FUNCTION IF EXISTS create_organization(text, uuid, text, text, text);
CREATE FUNCTION create_organization(
  p_name           text,
  p_user_id        uuid,
  p_business_name  text DEFAULT NULL,
  p_phone          text DEFAULT NULL,
  p_plan           text DEFAULT 'free',
  p_billing_period text DEFAULT 'monthly'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid; v_plan text; v_period text;
BEGIN
  v_plan   := COALESCE(NULLIF(p_plan, ''), 'free');
  IF NOT EXISTS (SELECT 1 FROM plans WHERE key = v_plan AND is_active) THEN v_plan := 'free'; END IF;
  v_period := CASE WHEN p_billing_period = 'yearly' THEN 'yearly' ELSE 'monthly' END;

  INSERT INTO organizations (name, business_name, phone, subscription_plan, billing_period)
  VALUES (p_name, COALESCE(NULLIF(p_business_name, ''), p_name), NULLIF(p_phone, ''), v_plan, v_period)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_users (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  RETURN v_org_id;
END $$;
GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text, text) TO authenticated;

-- 4. change_organization_plan now also sets the billing period.
DROP FUNCTION IF EXISTS change_organization_plan(uuid, uuid, text);
CREATE FUNCTION change_organization_plan(
  p_org_id         uuid,
  p_user_id        uuid,
  p_plan_key       text,
  p_billing_period text DEFAULT 'monthly'
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan plans%ROWTYPE; v_farms integer; v_users integer; v_period text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = p_org_id AND user_id = p_user_id AND role = 'owner' AND is_active
  ) THEN
    RETURN json_build_object('error', 'Only the owner can change the plan.');
  END IF;

  SELECT * INTO v_plan FROM plans WHERE key = p_plan_key AND is_active = true;
  IF NOT FOUND THEN RETURN json_build_object('error', 'That plan is not available.'); END IF;

  SELECT count(*) INTO v_farms FROM farms WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_users FROM organization_users WHERE organization_id = p_org_id AND is_active;

  IF v_plan.max_farms IS NOT NULL AND v_farms > v_plan.max_farms THEN
    RETURN json_build_object('error', format('You have %s farms but the %s plan allows %s. Remove farms first.', v_farms, v_plan.name, v_plan.max_farms));
  END IF;
  IF v_plan.max_users IS NOT NULL AND v_users > v_plan.max_users THEN
    RETURN json_build_object('error', format('You have %s users but the %s plan allows %s. Deactivate users first.', v_users, v_plan.name, v_plan.max_users));
  END IF;

  v_period := CASE WHEN p_billing_period = 'yearly' THEN 'yearly' ELSE 'monthly' END;

  UPDATE organizations
    SET subscription_plan = p_plan_key, billing_period = v_period,
        plan_changed_at = now(), plan_changed_by = p_user_id
    WHERE id = p_org_id;

  RETURN json_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION change_organization_plan(uuid, uuid, text, text) TO authenticated;
