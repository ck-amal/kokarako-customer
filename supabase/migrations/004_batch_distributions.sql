-- Migration 004: Link distributions and farm_expenses to a specific batch
-- Run in Supabase SQL Editor

ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

ALTER TABLE farm_expenses
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- Index for fast per-batch queries
CREATE INDEX IF NOT EXISTS distributions_batch_id_idx ON distributions(batch_id);
CREATE INDEX IF NOT EXISTS farm_expenses_batch_id_idx ON farm_expenses(batch_id);
