-- 053_fixed_assets.sql
-- Fixed assets table (vehicles, equipment, land, buildings, etc.)

CREATE TABLE IF NOT EXISTS fixed_assets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id),
  name             text        NOT NULL,
  category         text        NOT NULL DEFAULT 'other',
  purchase_date    date        NOT NULL,
  purchase_value   numeric(14,2) NOT NULL CHECK (purchase_value >= 0),
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by_id    uuid,
  created_by_name  text,
  updated_at       timestamptz,
  updated_by_id    uuid,
  updated_by_name  text
);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_assets_select" ON fixed_assets
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "fixed_assets_insert" ON fixed_assets
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "fixed_assets_update" ON fixed_assets
  FOR UPDATE USING (organization_id = get_user_organization_id());

CREATE POLICY "fixed_assets_delete" ON fixed_assets
  FOR DELETE USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_fixed_assets_org_id
  ON fixed_assets (organization_id);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_category
  ON fixed_assets (organization_id, category);
