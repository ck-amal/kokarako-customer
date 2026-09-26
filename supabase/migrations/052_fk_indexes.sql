-- Migration 052: Add indexes on all unindexed foreign key columns
-- 24 FK columns had no covering index, causing sequential scans on JOIN/lookup.

CREATE INDEX IF NOT EXISTS idx_batches_growing_fee_id            ON batches              (growing_fee_id);
CREATE INDEX IF NOT EXISTS idx_cash_collection_account_id        ON cash_collection      (account_id);
CREATE INDEX IF NOT EXISTS idx_distributions_item_id             ON distributions        (item_id);
CREATE INDEX IF NOT EXISTS idx_distributions_stock_id            ON distributions        (stock_id);
CREATE INDEX IF NOT EXISTS idx_farm_exp_ret_batch_id             ON farm_expense_returns (batch_id);
CREATE INDEX IF NOT EXISTS idx_farm_exp_ret_distribution_id      ON farm_expense_returns (distribution_id);
CREATE INDEX IF NOT EXISTS idx_farm_exp_ret_farm_id              ON farm_expense_returns (farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_exp_ret_stock_return_id      ON farm_expense_returns (stock_return_id);
CREATE INDEX IF NOT EXISTS idx_farm_expenses_distribution_id     ON farm_expenses        (distribution_id);
CREATE INDEX IF NOT EXISTS idx_growing_fee_adv_account_id        ON growing_fee_advances (account_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by            ON invitations          (invited_by);
CREATE INDEX IF NOT EXISTS idx_items_item_type_id                ON items                (item_type_id);
CREATE INDEX IF NOT EXISTS idx_org_users_invited_by              ON organization_users   (invited_by);
CREATE INDEX IF NOT EXISTS idx_procurement_item_id               ON procurement          (item_id);
CREATE INDEX IF NOT EXISTS idx_procurement_original_id           ON procurement          (original_procurement_id);
CREATE INDEX IF NOT EXISTS idx_procurement_supplier_id           ON procurement          (supplier_id);
CREATE INDEX IF NOT EXISTS idx_sales_item_id                     ON sales                (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_batch_id            ON stock_returns        (batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_distribution_id     ON stock_returns        (distribution_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_farm_id             ON stock_returns        (farm_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_item_id             ON stock_returns        (item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_account_id      ON supplier_payments    (account_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id     ON supplier_payments    (supplier_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id           ON transactions         (account_id);
