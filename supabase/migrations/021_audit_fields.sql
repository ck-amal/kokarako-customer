-- Migration 021: Add audit fields to all user-facing entry tables
--
-- Adds: created_by_id, created_by_name, updated_by_id, updated_by_name, updated_at
-- created_at already exists on all tables.
-- Names are denormalised at write time so no auth.users join is needed at read time.

ALTER TABLE procurement
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE cash_collection
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE growing_fee_advances
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

ALTER TABLE stock_returns
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

ALTER TABLE farm_expenses
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS created_by_id   UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id   UUID,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;
