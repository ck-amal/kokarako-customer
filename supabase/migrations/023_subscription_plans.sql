-- ============================================================================
-- Migration 023 — Configurable subscription plans + farm/user limit enforcement
-- ----------------------------------------------------------------------------
-- Run this on the project the app + admin panel share (target: khbuypzugydxvejjcoam).
-- Idempotent where practical. Assumes the base multi-org schema already exists
-- (organizations, organization_users, farms). super_admins is optional — the
-- admin write policy is only created if it exists.
-- ============================================================================

-- 1. PLANS CATALOG -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text UNIQUE NOT NULL,          -- stable identifier ('free', 'basic', ...)
  name          text NOT NULL,                 -- display name
  max_farms     integer,                        -- NULL = unlimited
  max_users     integer,                        -- NULL = unlimited
  price_monthly numeric NOT NULL DEFAULT 0,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);

-- Seed default plans (free = 2 farms / 1 user). ON CONFLICT keeps existing edits.
INSERT INTO plans (key, name, max_farms, max_users, price_monthly, sort_order, description) VALUES
  ('free',       'Free',       2,    1,    0,   1, '2 farms · 1 user — get started'),
  ('basic',      'Basic',      5,    5,    29,  2, '5 farms · 5 users'),
  ('pro',        'Pro',        20,   15,   79,  3, '20 farms · 15 users'),
  ('enterprise', 'Enterprise', NULL, NULL, 199, 4, 'Unlimited farms & users')
ON CONFLICT (key) DO NOTHING;

-- 2. ORGANIZATION PLAN TRACKING ---------------------------------------------
-- organizations.subscription_plan already exists (text, default 'free') and
-- references plans.key. Add change-tracking columns.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_changed_by uuid;

-- 3. RLS ON PLANS ------------------------------------------------------------
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Public read — signup (pre-auth) and the app both need to list plans.
DROP POLICY IF EXISTS plans_read ON plans;
CREATE POLICY plans_read ON plans FOR SELECT USING (true);

-- Writes restricted to super admins (admin panel). Created only if super_admins exists.
DROP POLICY IF EXISTS plans_write ON plans;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'super_admins') THEN
    EXECUTE $p$
      CREATE POLICY plans_write ON plans FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM super_admins s WHERE s.user_id = auth.uid() AND s.is_active))
        WITH CHECK (EXISTS (SELECT 1 FROM super_admins s WHERE s.user_id = auth.uid() AND s.is_active))
    $p$;
  ELSE
    RAISE NOTICE 'super_admins not found — plans_write policy skipped. Admin plan CRUD stays blocked until super_admins exists.';
  END IF;
END $$;

GRANT SELECT ON plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON plans TO authenticated;

-- 4. PREVENT DELETING A PLAN THAT IS IN USE ----------------------------------
CREATE OR REPLACE FUNCTION prevent_inuse_plan_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations o WHERE o.subscription_plan = OLD.key) THEN
    RAISE EXCEPTION 'PLAN_IN_USE: Cannot delete plan "%" — organizations are using it. Move them to another plan first.', OLD.key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_inuse_plan_delete ON plans;
CREATE TRIGGER trg_prevent_inuse_plan_delete BEFORE DELETE ON plans
  FOR EACH ROW EXECUTE FUNCTION prevent_inuse_plan_delete();

-- 5. LIMIT ENFORCEMENT TRIGGERS ---------------------------------------------
-- Farms: block INSERT once the org is at its plan's max_farms.
CREATE OR REPLACE FUNCTION enforce_farm_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_max integer; v_count integer;
BEGIN
  SELECT p.max_farms INTO v_max
    FROM organizations o JOIN plans p ON p.key = o.subscription_plan
    WHERE o.id = NEW.organization_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;            -- unlimited or unknown plan
  SELECT count(*) INTO v_count FROM farms WHERE organization_id = NEW.organization_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'FARM_LIMIT_REACHED: Your plan allows up to % farm(s). Upgrade the plan to add more.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_farm_limit ON farms;
CREATE TRIGGER trg_enforce_farm_limit BEFORE INSERT ON farms
  FOR EACH ROW EXECUTE FUNCTION enforce_farm_limit();

-- Users: block INSERT (and reactivation) once the org is at its plan's max_users.
CREATE OR REPLACE FUNCTION enforce_user_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_max integer; v_count integer;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;             -- inactive doesn't count
  IF TG_OP = 'UPDATE' AND OLD.is_active IS TRUE THEN RETURN NEW; END IF; -- already counted
  SELECT p.max_users INTO v_max
    FROM organizations o JOIN plans p ON p.key = o.subscription_plan
    WHERE o.id = NEW.organization_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM organization_users
    WHERE organization_id = NEW.organization_id AND is_active = true;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'USER_LIMIT_REACHED: Your plan allows up to % user(s). Upgrade the plan to add more.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON organization_users;
CREATE TRIGGER trg_enforce_user_limit BEFORE INSERT OR UPDATE ON organization_users
  FOR EACH ROW EXECUTE FUNCTION enforce_user_limit();

-- 6. OWNER-FACING PLAN CHANGE (self-service) --------------------------------
-- Returns json: { success: true } or { error: '...' }. Blocks downgrades below
-- current usage. auth.uid() can be NULL inside SECURITY DEFINER, so pass p_user_id.
CREATE OR REPLACE FUNCTION change_organization_plan(p_org_id uuid, p_user_id uuid, p_plan_key text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan plans%ROWTYPE; v_farms integer; v_users integer;
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

  UPDATE organizations
    SET subscription_plan = p_plan_key, plan_changed_at = now(), plan_changed_by = p_user_id
    WHERE id = p_org_id;

  RETURN json_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION change_organization_plan(uuid, uuid, text) TO authenticated;

-- 7. ORG CREATION NOW ACCEPTS A PLAN ----------------------------------------
-- Backward compatible: p_plan defaults to 'free', so existing callers are unaffected.
CREATE OR REPLACE FUNCTION create_organization(
  p_name          text,
  p_user_id       uuid,
  p_business_name text DEFAULT NULL,
  p_phone         text DEFAULT NULL,
  p_plan          text DEFAULT 'free'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid; v_plan text;
BEGIN
  v_plan := COALESCE(NULLIF(p_plan, ''), 'free');
  IF NOT EXISTS (SELECT 1 FROM plans WHERE key = v_plan AND is_active) THEN
    v_plan := 'free';
  END IF;

  INSERT INTO organizations (name, business_name, phone, subscription_plan)
  VALUES (p_name, COALESCE(NULLIF(p_business_name, ''), p_name), NULLIF(p_phone, ''), v_plan)
  RETURNING id INTO v_org_id;

  -- Owner row (is the org's first user; under free this is the single allowed user)
  INSERT INTO organization_users (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  RETURN v_org_id;
END $$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text) TO authenticated;

-- 8. ADMIN: set an org's plan freely (no downgrade guard — admin override) ----
-- CREATE OR REPLACE so it works against subscription_plan regardless of prior state.
CREATE OR REPLACE FUNCTION admin_update_plan(p_org_id uuid, p_plan text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE organizations
    SET subscription_plan = p_plan, plan_changed_at = now()
    WHERE id = p_org_id;

  -- Best-effort audit (only if the table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_activity_log') THEN
    INSERT INTO admin_activity_log (admin_user_id, action, organization_id, details)
    VALUES (auth.uid(), 'update_plan', p_org_id, json_build_object('plan', p_plan, 'reason', p_reason));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION admin_update_plan(uuid, text, text) TO authenticated;
