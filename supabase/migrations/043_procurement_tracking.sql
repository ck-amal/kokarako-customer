-- Migration 043: Link distributions and batch placements back to procurement lots
--
-- Enables per-lot stock tracking:
--   stock remaining per lot = procurement.quantity
--                           - SUM(distributions.quantity WHERE procurement_id = lot.id)
--                           - SUM(batch_chick_purchases.quantity WHERE procurement_id = lot.id)

ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS procurement_id uuid REFERENCES procurement(id) ON DELETE SET NULL;

ALTER TABLE batch_chick_purchases
  ADD COLUMN IF NOT EXISTS procurement_id uuid REFERENCES procurement(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS distributions_procurement_id_idx
  ON distributions (procurement_id) WHERE procurement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS batch_chick_purchases_procurement_id_idx
  ON batch_chick_purchases (procurement_id) WHERE procurement_id IS NOT NULL;
