-- Free trial configuration and org-level trial tracking.

-- ── App-wide settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default: 90-day free trial for every new org. Set to 0 to disable.
INSERT INTO app_settings (key, value, description)
VALUES ('free_trial_days', '90', 'Number of days of free trial granted to every new organisation. Set to 0 to disable.')
ON CONFLICT (key) DO NOTHING;

-- Authenticated users (web app) can read settings; only service role writes.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_app_settings" ON app_settings FOR SELECT TO authenticated USING (true);

-- ── trial_ends_at on organizations ────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ── Recreate create_organization to set trial_ends_at ─────────────────────────
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
  v_org_id      uuid;
  v_plan        text := COALESCE(NULLIF(p_plan_key, ''), 'free');
  v_period      text := COALESCE(NULLIF(p_billing_period, ''), 'monthly');
  v_trial_days  int  := 0;
  v_trial_end   timestamptz := NULL;
BEGIN
  -- Read configurable trial period (0 = no trial)
  SELECT value::int INTO v_trial_days FROM app_settings WHERE key = 'free_trial_days';
  v_trial_days := COALESCE(v_trial_days, 0);
  IF v_trial_days > 0 THEN
    v_trial_end := NOW() + (v_trial_days || ' days')::interval;
  END IF;

  INSERT INTO organizations (name, phone, subscription_plan, billing_period, trial_ends_at)
  VALUES (p_name, NULLIF(p_phone, ''), v_plan, v_period, v_trial_end)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'owner');
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(text, uuid, text, text, text) TO authenticated;
