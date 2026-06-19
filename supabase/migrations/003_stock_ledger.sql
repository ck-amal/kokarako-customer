-- ─── Migration 003: Stock Ledger & Farm Expenses ─────────────────────────────
-- Run in Supabase SQL Editor before using the new stock/distribution flow.

-- 1. Add cost_per_unit to procurement (if not present)
ALTER TABLE procurement
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12, 4);

-- 2. stock_ledger — every stock movement, ever
CREATE TABLE IF NOT EXISTS stock_ledger (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name      TEXT        NOT NULL,
  item_type      TEXT        NOT NULL, -- chicks / feed / medicine / equipment / other
  change_type    TEXT        NOT NULL CHECK (change_type IN ('in', 'out')),
  quantity       NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit           TEXT        NOT NULL,
  reference_type TEXT        NOT NULL, -- procurement / batch / distribution
  reference_id   UUID        NOT NULL,
  date           DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_ledger_item_name_idx   ON stock_ledger(item_name);
CREATE INDEX IF NOT EXISTS stock_ledger_item_type_idx   ON stock_ledger(item_type);
CREATE INDEX IF NOT EXISTS stock_ledger_reference_idx   ON stock_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS stock_ledger_date_idx        ON stock_ledger(date);

-- 3. farm_expenses — auto-created on every distribution to a farm
CREATE TABLE IF NOT EXISTS farm_expenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id        UUID        REFERENCES batches(id) ON DELETE SET NULL,
  distribution_id UUID        REFERENCES distributions(id) ON DELETE SET NULL,
  item_name       TEXT        NOT NULL,
  item_type       TEXT        NOT NULL, -- feed / medicine / other
  quantity        NUMERIC(14, 4) NOT NULL,
  unit            TEXT        NOT NULL,
  cost_per_unit   NUMERIC(12, 4) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date            DATE        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS farm_expenses_farm_id_idx ON farm_expenses(farm_id);
CREATE INDEX IF NOT EXISTS farm_expenses_batch_id_idx ON farm_expenses(batch_id);
