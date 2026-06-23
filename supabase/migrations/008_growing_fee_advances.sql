-- Migration 008: Growing Fee Advances
-- Adds advance payment tracking for growing fees
-- Advances are given to farm owners during an active batch,
-- and deducted from the calculated growing fee when the batch is closed.

-- ── 1. New table: growing_fee_advances ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growing_fee_advances (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id         UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  amount           NUMERIC     NOT NULL CHECK (amount > 0),
  payment_date     DATE        NOT NULL,
  payment_method   TEXT        CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Cheque', 'Other')),
  reference_number TEXT,
  account_id       UUID        REFERENCES accounts(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS growing_fee_advances_farm_id_idx  ON growing_fee_advances(farm_id);
CREATE INDEX IF NOT EXISTS growing_fee_advances_batch_id_idx ON growing_fee_advances(batch_id);

-- ── 2. Update growing_fee_ledger ──────────────────────────────────────────────
-- total_advances: sum of all advances given for this batch (set at batch close)
ALTER TABLE growing_fee_ledger ADD COLUMN IF NOT EXISTS total_advances  NUMERIC NOT NULL DEFAULT 0;
-- overpaid_amount: when total_advances > total_fee, store the excess here
ALTER TABLE growing_fee_ledger ADD COLUMN IF NOT EXISTS overpaid_amount NUMERIC NOT NULL DEFAULT 0;

-- ── 3. Update batches table ───────────────────────────────────────────────────
-- Running total of advances given during this batch (updated on each advance)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS total_advances NUMERIC NOT NULL DEFAULT 0;
