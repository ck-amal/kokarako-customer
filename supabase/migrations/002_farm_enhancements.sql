-- ─── Migration 002: Farm Enhancements ────────────────────────────────────────
-- Run this in the Supabase SQL Editor before using the new Farms module.

-- 1. Add phone_number to farms
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 2. Create distributions table (feed/medicine sent to a specific farm)
CREATE TABLE IF NOT EXISTS distributions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  stock_id   UUID        REFERENCES stock(id) ON DELETE SET NULL,
  item_name  TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('feed', 'medicine', 'other')),
  quantity   NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit       TEXT        NOT NULL,
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS distributions_farm_id_idx ON distributions(farm_id);
CREATE INDEX IF NOT EXISTS distributions_date_idx    ON distributions(date);
