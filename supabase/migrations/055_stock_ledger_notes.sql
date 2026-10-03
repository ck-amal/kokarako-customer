-- 055_stock_ledger_notes.sql
-- Add notes column to stock_ledger for manual adjustment reasons

ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS notes text;
