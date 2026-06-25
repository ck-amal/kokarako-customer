-- ════════════════════════════════════════════════════════════════════════════
-- 017_multi_org.sql — Multi-organisation support + RBAC
--
-- EXECUTION ORDER (run sequentially in Supabase SQL Editor):
--   STEP 1  Create new tables
--   STEP 2  Add organization_id columns to all existing tables
--   STEP 3  Create initial organisation for existing data  ← YOU FILL VALUES
--   STEP 4  Backfill organization_id on all existing rows  ← YOU FILL VALUES
--   STEP 5  Make organization_id NOT NULL on all tables
--   STEP 6  Enable RLS + create helper functions
--   STEP 7  Create RLS policies on every table
-- ════════════════════════════════════════════════════════════════════════════

-- ── STEP 1: New tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  business_name     text,
  phone             text,
  address           text,
  subscription_plan text        NOT NULL DEFAULT 'free',
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('owner','manager','farm_supervisor','accountant','viewer')),
  is_active       boolean     NOT NULL DEFAULT true,
  invited_by      uuid        REFERENCES auth.users(id),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('owner','manager','farm_supervisor','accountant','viewer')),
  token           text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by      uuid        REFERENCES auth.users(id),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── STEP 2: Add organization_id to all existing tables ──────────────────────

ALTER TABLE farms               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE batches             ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE procurement         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE stock               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE stock_ledger        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE items               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE item_types          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE vendors             ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE suppliers           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE expenses            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE cash_collection     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE supplier_payments   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE growing_fee_config  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE growing_fee_ledger  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE growing_fee_advances ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE farm_expenses       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE distributions       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE farm_stock          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE stock_returns       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE farm_expense_returns ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Add to accounts + transactions if they exist
ALTER TABLE accounts     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Add to growing_fee_payments if it exists
-- (comment out if table doesn't exist in your schema)
-- ALTER TABLE growing_fee_payments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);


-- ── STEP 3: Create the initial organisation for existing data ───────────────
-- Run this block, note the returned id, use it in STEP 4.

INSERT INTO organizations (name, business_name)
VALUES ('My Poultry Farm', 'Poultry Farm Management')
RETURNING id;

-- ↑ Copy the UUID returned above and replace PASTE_ORG_ID_HERE below.
-- Also run:  SELECT id FROM auth.users LIMIT 5;
-- Copy your user id and replace PASTE_USER_ID_HERE below.


-- ── STEP 4: Link existing user + backfill organization_id ───────────────────
-- Replace PASTE_ORG_ID_HERE and PASTE_USER_ID_HERE with real values.

-- INSERT INTO organization_users (organization_id, user_id, role)
-- VALUES ('PASTE_ORG_ID_HERE', 'PASTE_USER_ID_HERE', 'owner');

-- UPDATE farms               SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE batches             SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE procurement         SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE stock               SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE stock_ledger        SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE items               SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE item_types          SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE vendors             SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE suppliers           SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE sales               SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE expenses            SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE cash_collection     SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE supplier_payments   SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE growing_fee_config  SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE growing_fee_ledger  SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE growing_fee_advances SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE farm_expenses       SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE distributions       SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE farm_stock          SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE stock_returns       SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE farm_expense_returns SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE accounts            SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;
-- UPDATE transactions        SET organization_id = 'PASTE_ORG_ID_HERE' WHERE organization_id IS NULL;


-- ── STEP 5: Make organization_id NOT NULL (run AFTER Step 4 backfill) ────────
-- Only run this after confirming all rows have organization_id set.

-- ALTER TABLE farms               ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE batches             ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE procurement         ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE stock               ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE stock_ledger        ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE items               ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE item_types          ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE vendors             ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE suppliers           ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE sales               ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE expenses            ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE cash_collection     ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE supplier_payments   ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE growing_fee_config  ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE growing_fee_ledger  ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE growing_fee_advances ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE farm_expenses       ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE distributions       ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE farm_stock          ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE stock_returns       ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE farm_expense_returns ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE accounts            ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE transactions        ALTER COLUMN organization_id SET NOT NULL;


-- ── STEP 6: RLS helper functions ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id
  FROM organization_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role
  FROM organization_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Enable RLS on all tables
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock                ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_collection      ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE growing_fee_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growing_fee_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE growing_fee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_stock           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_returns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_expense_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;


-- ── STEP 7: RLS policies ─────────────────────────────────────────────────────

-- ── organizations ──
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = get_user_organization_id());
CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── organization_users ──
CREATE POLICY "ou_select" ON organization_users FOR SELECT
  USING (organization_id = get_user_organization_id());
CREATE POLICY "ou_insert" ON organization_users FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
CREATE POLICY "ou_update" ON organization_users FOR UPDATE
  USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── invitations ──
CREATE POLICY "inv_select" ON invitations FOR SELECT
  USING (organization_id = get_user_organization_id());
CREATE POLICY "inv_insert" ON invitations FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
CREATE POLICY "inv_update" ON invitations FOR UPDATE
  USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
CREATE POLICY "inv_delete" ON invitations FOR DELETE
  USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
-- Allow unauthenticated/new users to read an invitation by token (for acceptance flow)
CREATE POLICY "inv_read_by_token" ON invitations FOR SELECT
  USING (true);  -- token validation done in app; RLS just allows read


-- ── MACRO: standard 4-policy set for operational tables
-- Pattern: all roles SELECT; owner+manager INSERT/UPDATE; owner DELETE

-- ── farms ──
CREATE POLICY "farms_select" ON farms FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "farms_insert" ON farms FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "farms_update" ON farms FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "farms_delete" ON farms FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── batches ──
CREATE POLICY "batches_select" ON batches FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "batches_insert" ON batches FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "batches_update" ON batches FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "batches_delete" ON batches FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── procurement ──
CREATE POLICY "proc_select" ON procurement FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "proc_insert" ON procurement FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "proc_update" ON procurement FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "proc_delete" ON procurement FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── stock ──
CREATE POLICY "stock_select" ON stock FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "stock_insert" ON stock FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "stock_update" ON stock FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "stock_delete" ON stock FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── stock_ledger ──
CREATE POLICY "sl_select" ON stock_ledger FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "sl_insert" ON stock_ledger FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "sl_update" ON stock_ledger FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sl_delete" ON stock_ledger FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── items ──
CREATE POLICY "items_select" ON items FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "items_insert" ON items FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "items_update" ON items FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "items_delete" ON items FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── item_types ──
CREATE POLICY "it_select" ON item_types FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "it_insert" ON item_types FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "it_update" ON item_types FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "it_delete" ON item_types FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── vendors ──
CREATE POLICY "vendors_select" ON vendors FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "vendors_insert" ON vendors FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "vendors_update" ON vendors FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "vendors_delete" ON vendors FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── suppliers ──
CREATE POLICY "sup_select" ON suppliers FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "sup_insert" ON suppliers FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sup_update" ON suppliers FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sup_delete" ON suppliers FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── sales ──
CREATE POLICY "sales_select" ON sales FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "sales_insert" ON sales FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "sales_update" ON sales FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sales_delete" ON sales FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── expenses ──
CREATE POLICY "exp_select" ON expenses FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "exp_insert" ON expenses FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "exp_update" ON expenses FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "exp_delete" ON expenses FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── cash_collection ──
CREATE POLICY "cc_select" ON cash_collection FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "cc_insert" ON cash_collection FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "cc_update" ON cash_collection FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "cc_delete" ON cash_collection FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── supplier_payments ──
CREATE POLICY "sp_select" ON supplier_payments FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "sp_insert" ON supplier_payments FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sp_update" ON supplier_payments FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sp_delete" ON supplier_payments FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── growing_fee_config ──
CREATE POLICY "gfc_select" ON growing_fee_config FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "gfc_insert" ON growing_fee_config FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
CREATE POLICY "gfc_update" ON growing_fee_config FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
CREATE POLICY "gfc_delete" ON growing_fee_config FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── growing_fee_ledger ──
CREATE POLICY "gfl_select" ON growing_fee_ledger FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "gfl_insert" ON growing_fee_ledger FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "gfl_update" ON growing_fee_ledger FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "gfl_delete" ON growing_fee_ledger FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── growing_fee_advances ──
CREATE POLICY "gfa_select" ON growing_fee_advances FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "gfa_insert" ON growing_fee_advances FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "gfa_update" ON growing_fee_advances FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "gfa_delete" ON growing_fee_advances FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── farm_expenses ──
CREATE POLICY "fe_select" ON farm_expenses FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fe_insert" ON farm_expenses FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "fe_update" ON farm_expenses FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "fe_delete" ON farm_expenses FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── distributions ──
CREATE POLICY "dist_select" ON distributions FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "dist_insert" ON distributions FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "dist_update" ON distributions FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "dist_delete" ON distributions FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── farm_stock ──
CREATE POLICY "fs_select" ON farm_stock FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fs_insert" ON farm_stock FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "fs_update" ON farm_stock FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "fs_delete" ON farm_stock FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── stock_returns ──
CREATE POLICY "sr_select" ON stock_returns FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "sr_insert" ON stock_returns FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "sr_update" ON stock_returns FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "sr_delete" ON stock_returns FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── farm_expense_returns ──
CREATE POLICY "fer_select" ON farm_expense_returns FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fer_insert" ON farm_expense_returns FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "fer_update" ON farm_expense_returns FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "fer_delete" ON farm_expense_returns FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── accounts ──
CREATE POLICY "acc_select" ON accounts FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "acc_insert" ON accounts FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "acc_update" ON accounts FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "acc_delete" ON accounts FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');

-- ── transactions ──
CREATE POLICY "txn_select" ON transactions FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "txn_insert" ON transactions FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager','farm_supervisor'));
CREATE POLICY "txn_update" ON transactions FOR UPDATE USING (organization_id = get_user_organization_id() AND get_user_role() IN ('owner','manager'));
CREATE POLICY "txn_delete" ON transactions FOR DELETE USING (organization_id = get_user_organization_id() AND get_user_role() = 'owner');
