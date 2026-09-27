-- 054_farm_visits.sql
-- Farm visit log: tracks who visited, when, notes, and per-batch mortality

CREATE TABLE IF NOT EXISTS farm_visits (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id),
  farm_id          uuid        NOT NULL REFERENCES farms(id),
  visit_date       date        NOT NULL DEFAULT CURRENT_DATE,
  visited_by_id    uuid,
  visited_by_name  text        NOT NULL DEFAULT '',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE farm_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_visits_select" ON farm_visits
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "farm_visits_insert" ON farm_visits
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "farm_visits_update" ON farm_visits
  FOR UPDATE USING (organization_id = get_user_organization_id());

CREATE POLICY "farm_visits_delete" ON farm_visits
  FOR DELETE USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_farm_visits_farm_id
  ON farm_visits (organization_id, farm_id, visit_date DESC);

-- Per-batch mortality recorded during a visit

CREATE TABLE IF NOT EXISTS farm_visit_mortality (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id),
  visit_id        uuid    NOT NULL REFERENCES farm_visits(id) ON DELETE CASCADE,
  batch_id        uuid    NOT NULL REFERENCES batches(id),
  mortality_count integer NOT NULL DEFAULT 0 CHECK (mortality_count >= 0)
);

ALTER TABLE farm_visit_mortality ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_visit_mortality_select" ON farm_visit_mortality
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "farm_visit_mortality_insert" ON farm_visit_mortality
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "farm_visit_mortality_update" ON farm_visit_mortality
  FOR UPDATE USING (organization_id = get_user_organization_id());

CREATE POLICY "farm_visit_mortality_delete" ON farm_visit_mortality
  FOR DELETE USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_farm_visit_mortality_visit_id
  ON farm_visit_mortality (visit_id);

CREATE INDEX IF NOT EXISTS idx_farm_visit_mortality_batch_id
  ON farm_visit_mortality (batch_id);
