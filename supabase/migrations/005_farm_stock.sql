-- Migration 005: Farm-level stock tracking
-- Tracks physical stock (feed, medicine, etc.) currently present at each farm.
-- Auto-incremented when a distribution is recorded.
-- User can manually set quantity_on_hand via a physical stocktake.

CREATE TABLE IF NOT EXISTS farm_stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  item_name    TEXT NOT NULL,
  unit         TEXT NOT NULL,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (farm_id, item_name)
);

CREATE INDEX IF NOT EXISTS farm_stock_farm_id_idx ON farm_stock(farm_id);
