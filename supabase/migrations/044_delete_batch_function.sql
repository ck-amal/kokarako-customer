-- Migration 044: Atomic batch deletion with full stock reversal
--
-- Reversal order:
--   1. Return distributed items (feed/medicine) to central stock & remove from farm_stock
--   2. Return chicks to central stock
--   3. Purge all ledger entries created by this batch and its distributions
--   4. Delete all child records (expenses, sales, fee records, etc.)
--   5. Delete the batch row itself

CREATE OR REPLACE FUNCTION delete_batch(p_batch_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chick_qty numeric;
BEGIN
  -- Guard: batch must belong to the org
  IF NOT EXISTS (
    SELECT 1 FROM batches WHERE id = p_batch_id AND organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Batch not found or access denied';
  END IF;

  -- ── 1. Reverse distributions ──────────────────────────────────────────────

  -- Add distributed quantities back to central stock
  UPDATE stock s
  SET    quantity = s.quantity + d.qty
  FROM (
    SELECT item_name, SUM(quantity) AS qty
    FROM   distributions
    WHERE  batch_id = p_batch_id
    GROUP  BY item_name
  ) d
  WHERE  LOWER(s.item_name) = LOWER(d.item_name)
    AND  s.organization_id  = p_org_id;

  -- Remove those quantities from farm-level stock
  UPDATE farm_stock fs
  SET    quantity_on_hand = GREATEST(0, fs.quantity_on_hand - d.quantity)
  FROM   distributions d
  WHERE  d.batch_id       = p_batch_id
    AND  fs.farm_id       = d.farm_id
    AND  LOWER(fs.item_name) = LOWER(d.item_name);

  -- Delete stock_ledger OUT entries created by these distributions
  DELETE FROM stock_ledger
  WHERE  reference_type    = 'distribution'
    AND  organization_id   = p_org_id
    AND  reference_id IN (
      SELECT id FROM distributions WHERE batch_id = p_batch_id
    );

  -- Delete farm_expense_returns linked to these distributions (best-effort)
  BEGIN
    DELETE FROM farm_expense_returns
    WHERE  distribution_id IN (
      SELECT id FROM distributions WHERE batch_id = p_batch_id
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL; -- table may not exist in all deployments
  END;

  -- Delete farm_expenses for this batch
  DELETE FROM farm_expenses
  WHERE  batch_id = p_batch_id
    AND  organization_id = p_org_id;

  -- Delete distributions
  DELETE FROM distributions
  WHERE  batch_id         = p_batch_id
    AND  organization_id  = p_org_id;

  -- ── 2. Reverse chick placement ────────────────────────────────────────────

  SELECT COALESCE(SUM(quantity), 0)
  INTO   v_chick_qty
  FROM   batch_chick_purchases
  WHERE  batch_id = p_batch_id;

  IF v_chick_qty > 0 THEN
    UPDATE stock
    SET    quantity = quantity + v_chick_qty
    WHERE  organization_id  = p_org_id
      AND  LOWER(item_name) = 'chicks';
  END IF;

  -- Delete stock_ledger OUT entry for chick batch placement
  DELETE FROM stock_ledger
  WHERE  reference_type  = 'batch'
    AND  reference_id    = p_batch_id
    AND  organization_id = p_org_id;

  -- Delete batch_chick_purchases
  DELETE FROM batch_chick_purchases
  WHERE  batch_id = p_batch_id;

  -- ── 3. Delete sales ───────────────────────────────────────────────────────

  DELETE FROM sales
  WHERE  batch_id         = p_batch_id
    AND  organization_id  = p_org_id;

  -- ── 4. Delete extra expenses ──────────────────────────────────────────────

  BEGIN
    DELETE FROM expenses
    WHERE  batch_id         = p_batch_id
      AND  organization_id  = p_org_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ── 5. Delete growing fee records ─────────────────────────────────────────

  BEGIN
    DELETE FROM growing_fee_ledger
    WHERE  batch_id         = p_batch_id
      AND  organization_id  = p_org_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM growing_fee_advances
    WHERE  batch_id         = p_batch_id
      AND  organization_id  = p_org_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ── 6. Delete the batch ───────────────────────────────────────────────────

  DELETE FROM batches
  WHERE  id               = p_batch_id
    AND  organization_id  = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_batch(uuid, uuid) TO authenticated;
