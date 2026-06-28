-- ============================================================================
-- FIX — accounting columns missing on khbuypzugydxvejjcoam
-- ----------------------------------------------------------------------------
-- The project's base (UAT) schema predates supabase_accounting_migration.sql.
-- The accounts/transactions tables already exist, but these two ALTER columns
-- were never applied — causing "Could not find the 'expense_category_type'
-- column of 'expenses' in the schema cache" (and the same for stock.avg_cost).
--
-- Run in the Supabase SQL Editor on khbuypzugydxvejjcoam. Idempotent & safe.
-- ============================================================================

-- 1. Expense classification — Operating Expense vs Direct Cost (COGS)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_category_type text NOT NULL DEFAULT 'operating'
    CHECK (expense_category_type IN ('cogs', 'operating'));

-- 2. Stock weighted-average cost — used by addToStock + Dashboard stock value
ALTER TABLE stock
  ADD COLUMN IF NOT EXISTS avg_cost numeric NOT NULL DEFAULT 0;
