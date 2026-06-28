-- ─── 028 · Sales confirmation workflow ──────────────────────────────────────
-- A sale no longer counts anywhere until CONFIRMED. Recording creates a
-- 'pending' sale; it still counts against the flock (to prevent overselling)
-- but NOT toward revenue / receivables / P&L / FCR until confirmed. Owner,
-- manager, or accountant confirm. Run on khbuypzugydxvejjcoam. Idempotent.

-- 1. Schema ───────────────────────────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected')),
  ADD COLUMN IF NOT EXISTS confirmed_by_id   UUID,
  ADD COLUMN IF NOT EXISTS confirmed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reject_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_status       ON sales(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_batch_status ON sales(batch_id, status);

-- 2. Backfill — existing sales already counted under the old flow → 'confirmed'.
--    One-time: only rows created before this migration (>1h old) are touched, so
--    re-running won't clobber genuinely-pending sales recorded during normal use.
UPDATE sales
   SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, created_at)
 WHERE status = 'pending' AND created_at < now() - interval '1 hour';

-- 3. Views — count only CONFIRMED sales (and only VERIFIED collections). ───────
CREATE OR REPLACE VIEW vendor_balances AS
SELECT
  v.id                                                          AS vendor_id,
  v.name                                                        AS vendor_name,
  v.organization_id,
  COALESCE(s.total_sales,      0)                               AS total_sales,
  COALESCE(cc.total_collected, 0)                               AS total_collected,
  COALESCE(s.total_sales, 0) - COALESCE(cc.total_collected, 0)  AS outstanding_balance
FROM vendors v
LEFT JOIN (
  SELECT vendor_id, organization_id, SUM(total_amount) AS total_sales
  FROM sales WHERE status = 'confirmed'
  GROUP BY vendor_id, organization_id
) s  ON s.vendor_id = v.id AND s.organization_id = v.organization_id
LEFT JOIN (
  SELECT vendor_id, organization_id, SUM(amount_paid) AS total_collected
  FROM cash_collection WHERE status = 'verified'
  GROUP BY vendor_id, organization_id
) cc ON cc.vendor_id = v.id AND cc.organization_id = v.organization_id;

CREATE OR REPLACE VIEW batch_summary AS
SELECT
  b.id                                                          AS batch_id,
  b.organization_id,
  f.name                                                        AS farm_name,
  b.start_date,
  b.chick_count,
  b.status,
  COALESCE(p.total_procurement,  0)                            AS total_procurement_cost,
  COALESCE(e.total_expenses,     0)                            AS total_expenses,
  COALESCE(s.total_revenue,      0)                            AS total_revenue,
  COALESCE(s.total_revenue, 0)
    - COALESCE(p.total_procurement, 0)
    - COALESCE(e.total_expenses, 0)                            AS net_profit
FROM batches b
JOIN  farms       f ON f.id = b.farm_id
LEFT JOIN (SELECT batch_id, SUM(cost)         AS total_procurement FROM procurement GROUP BY batch_id) p ON p.batch_id = b.id
LEFT JOIN (SELECT batch_id, SUM(amount)       AS total_expenses    FROM expenses    GROUP BY batch_id) e ON e.batch_id = b.id
LEFT JOIN (SELECT batch_id, SUM(total_amount) AS total_revenue     FROM sales WHERE status = 'confirmed' GROUP BY batch_id) s ON s.batch_id = b.id;

-- 4. Confirm RPC — owner/manager/accountant; re-checks overselling. ────────────
CREATE OR REPLACE FUNCTION confirm_sale(p_id UUID, p_by_name TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT := get_user_role();
  v_org       UUID := get_user_organization_id();
  v_sale      sales%ROWTYPE;
  v_live      INT;
  v_confirmed INT;
BEGIN
  IF v_role NOT IN ('owner','manager','accountant') THEN
    RAISE EXCEPTION 'Only an owner, manager, or accountant can confirm sales';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_id;
  IF NOT FOUND OR v_sale.organization_id <> v_org THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF v_sale.status <> 'pending' THEN RAISE EXCEPTION 'Sale is not pending (already %).', v_sale.status; END IF;

  -- Overselling guard: confirmed birds (excluding this) + this <= live flock
  SELECT (b.chick_count - COALESCE(b.mortality_count, 0)) INTO v_live FROM batches b WHERE b.id = v_sale.batch_id;
  SELECT COALESCE(SUM(chicken_count), 0) INTO v_confirmed FROM sales
   WHERE batch_id = v_sale.batch_id AND status = 'confirmed' AND id <> p_id;
  IF v_live IS NOT NULL AND COALESCE(v_sale.chicken_count, 0) > 0
     AND v_confirmed + COALESCE(v_sale.chicken_count, 0) > v_live THEN
    RAISE EXCEPTION 'Confirming exceeds the flock: % already confirmed of % live birds', v_confirmed, v_live;
  END IF;

  UPDATE sales SET
    status = 'confirmed', confirmed_by_id = v_uid, confirmed_by_name = p_by_name,
    confirmed_at = NOW(), updated_by_id = v_uid, updated_by_name = p_by_name, updated_at = NOW()
  WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION confirm_sale TO authenticated;

-- 5. Reject RPC — owner/manager/accountant; voids the sale. ────────────────────
CREATE OR REPLACE FUNCTION reject_sale(p_id UUID, p_reason TEXT DEFAULT NULL, p_by_name TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_role TEXT := get_user_role();
BEGIN
  IF v_role NOT IN ('owner','manager','accountant') THEN
    RAISE EXCEPTION 'Only an owner, manager, or accountant can reject sales';
  END IF;
  UPDATE sales SET
    status = 'rejected', reject_reason = p_reason,
    confirmed_by_id = v_uid, confirmed_by_name = p_by_name, confirmed_at = NOW(),
    updated_by_id = v_uid, updated_by_name = p_by_name, updated_at = NOW()
  WHERE id = p_id AND organization_id = get_user_organization_id() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not pending or not found'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION reject_sale TO authenticated;
