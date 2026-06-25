-- Stock Return feature: tables + distributions.returned_quantity column
--
-- When feed/medicine is taken back from a farm:
--   stock_returns      — audit log of the return event
--   farm_expense_returns — cost credit that offsets the original farm_expenses row
--   distributions.returned_quantity — denormalised sum for fast "net distributed" display

CREATE TABLE IF NOT EXISTS stock_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id        UUID             REFERENCES batches(id)       ON DELETE SET NULL,
  distribution_id UUID             REFERENCES distributions(id)  ON DELETE SET NULL,
  item_id         UUID             REFERENCES items(id)          ON DELETE SET NULL,
  item_name       TEXT NOT NULL,
  item_type       TEXT NOT NULL,
  quantity        NUMERIC NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  return_to_stock BOOLEAN NOT NULL DEFAULT TRUE,
  date            DATE NOT NULL,
  reason          TEXT,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS farm_expense_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stock_return_id UUID NOT NULL REFERENCES stock_returns(id) ON DELETE CASCADE,
  distribution_id UUID         REFERENCES distributions(id)  ON DELETE SET NULL,
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id        UUID         REFERENCES batches(id) ON DELETE SET NULL,
  item_name       TEXT NOT NULL,
  item_type       TEXT NOT NULL,
  quantity        NUMERIC NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL,
  cost_per_unit   NUMERIC NOT NULL DEFAULT 0,
  total_cost      NUMERIC NOT NULL DEFAULT 0,
  date            DATE NOT NULL
);

-- Denormalised returned-quantity on distributions for quick net display
ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC NOT NULL DEFAULT 0;
