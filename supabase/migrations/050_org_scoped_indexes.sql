-- Migration 050: Add missing organization_id indexes for RLS + query performance
--
-- Problem: 28 tables have organization_id but only 5 had org-scoped indexes.
-- Every DB request triggers get_user_organization_id() which queries
-- organization_users by user_id — that alone needed an index urgently.
-- All data tables need org indexes so RLS filters don't full-scan at scale.
--
-- No data changes. Safe to run on a live database.

-- ── Critical: hit on every single request via the RLS helper function ─────────
-- get_user_organization_id() does: WHERE user_id = ? AND is_active = true
-- The existing unique index is on (organization_id, user_id) — wrong column order
-- for user_id lookups. This is the highest-priority index in the whole schema.
CREATE INDEX IF NOT EXISTS idx_org_users_user_id
  ON organization_users (user_id, is_active);

-- ── High-growth data tables ───────────────────────────────────────────────────
-- stock_ledger is append-only and grows with every farm activity
CREATE INDEX IF NOT EXISTS idx_stock_ledger_org_id
  ON stock_ledger (organization_id);

CREATE INDEX IF NOT EXISTS idx_distributions_org_id
  ON distributions (organization_id);

CREATE INDEX IF NOT EXISTS idx_expenses_org_id
  ON expenses (organization_id);

CREATE INDEX IF NOT EXISTS idx_transactions_org_id
  ON transactions (organization_id);

-- ── Core entity tables (loaded on every dashboard/list page) ─────────────────
CREATE INDEX IF NOT EXISTS idx_farms_org_id
  ON farms (organization_id);

CREATE INDEX IF NOT EXISTS idx_vendors_org_id
  ON vendors (organization_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_id
  ON suppliers (organization_id);

CREATE INDEX IF NOT EXISTS idx_items_org_id
  ON items (organization_id);

CREATE INDEX IF NOT EXISTS idx_item_types_org_id
  ON item_types (organization_id);

CREATE INDEX IF NOT EXISTS idx_accounts_org_id
  ON accounts (organization_id);

-- ── Operational tables ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_org_id
  ON stock (organization_id);

CREATE INDEX IF NOT EXISTS idx_stock_returns_org_id
  ON stock_returns (organization_id);

CREATE INDEX IF NOT EXISTS idx_farm_expenses_org_id
  ON farm_expenses (organization_id);

CREATE INDEX IF NOT EXISTS idx_farm_expense_returns_org_id
  ON farm_expense_returns (organization_id);

CREATE INDEX IF NOT EXISTS idx_farm_stock_org_id
  ON farm_stock (organization_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_org_id
  ON supplier_payments (organization_id);

-- ── Growing fee tables ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_growing_fee_config_org_id
  ON growing_fee_config (organization_id);

CREATE INDEX IF NOT EXISTS idx_growing_fee_ledger_org_id
  ON growing_fee_ledger (organization_id);

CREATE INDEX IF NOT EXISTS idx_growing_fee_advances_org_id
  ON growing_fee_advances (organization_id);

CREATE INDEX IF NOT EXISTS idx_growing_fee_payments_org_id
  ON growing_fee_payments (organization_id);

-- ── Invitation (for new org-scoped RLS policy from migration 048) ─────────────
CREATE INDEX IF NOT EXISTS idx_invitations_org_id
  ON invitations (organization_id);

-- ── Subscription events ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscription_events_org_id
  ON subscription_events (organization_id);
