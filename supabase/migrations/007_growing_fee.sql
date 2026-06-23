-- Migration 007: Growing Fee System
-- Run this in Supabase SQL Editor

-- ─── 1. Farm owner details ────────────────────────────────────────────────────

ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_name    text;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_phone   text;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_address text;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS owner_notes   text;

-- ─── 2. Growing Fee Config (FCR tier rates) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS growing_fee_config (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fcr_from     numeric     NOT NULL,
  fcr_to       numeric,            -- NULL = no upper limit (last tier)
  rate_per_kg  numeric     NOT NULL,
  description  text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed default tiers (only if table is empty)
INSERT INTO growing_fee_config (fcr_from, fcr_to, rate_per_kg, description)
SELECT * FROM (VALUES
  (0.0,  1.0,  18, 'Exceptional performance'),
  (1.0,  1.5,  16, 'Excellent performance'),
  (1.5,  2.0,  14, 'Good performance'),
  (2.0,  2.5,  12, 'Average performance'),
  (2.5,  3.0,  10, 'Below average performance'),
  (3.0,  null,  8, 'Poor performance')
) AS t(fcr_from, fcr_to, rate_per_kg, description)
WHERE NOT EXISTS (SELECT 1 FROM growing_fee_config LIMIT 1);

-- ─── 3. Growing Fee Ledger ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS growing_fee_ledger (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             uuid        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id            uuid        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  owner_name          text,
  fcr                 numeric,
  fcr_tier_description text,
  rate_per_kg         numeric,
  total_sale_kg       numeric,
  total_fee           numeric,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','partial','paid')),
  amount_paid         numeric     NOT NULL DEFAULT 0,
  balance_due         numeric,
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growing_fee_ledger_farm_id_idx  ON growing_fee_ledger(farm_id);
CREATE INDEX IF NOT EXISTS growing_fee_ledger_batch_id_idx ON growing_fee_ledger(batch_id);
CREATE INDEX IF NOT EXISTS growing_fee_ledger_status_idx   ON growing_fee_ledger(status);

-- ─── 4. Growing Fee Payments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS growing_fee_payments (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  growing_fee_ledger_id  uuid        REFERENCES growing_fee_ledger(id) ON DELETE SET NULL,
  farm_id                uuid        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  amount                 numeric     NOT NULL,
  payment_date           date        NOT NULL,
  payment_method         text        DEFAULT 'Cash',
  reference_number       text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growing_fee_payments_farm_id_idx    ON growing_fee_payments(farm_id);
CREATE INDEX IF NOT EXISTS growing_fee_payments_ledger_id_idx  ON growing_fee_payments(growing_fee_ledger_id);

-- ─── 5. Update batches table ──────────────────────────────────────────────────

ALTER TABLE batches ADD COLUMN IF NOT EXISTS growing_fee_id       uuid    REFERENCES growing_fee_ledger(id) ON DELETE SET NULL;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS growing_fee_per_kg   numeric;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS growing_fee_total    numeric;
