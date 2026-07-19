-- Migration 045: Atomic procurement deletion with full stock reversal
--
-- On delete:
--   1. Subtract quantity from stock cache, recalculate avg_cost from remaining procurements
--   2. Delete stock_ledger IN entry
--   3. Delete any "pay now" transactions linked to this procurement
--   4. Null out procurement_id on distributions / batch_chick_purchases (keep them as untracked)
--   5. Delete the procurement row

CREATE OR REPLACE FUNCTION delete_procurement(p_proc_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_quantity  numeric;
BEGIN
  -- Guard
  SELECT item_name, quantity
  INTO   v_item_name, v_quantity
  FROM   procurement
  WHERE  id = p_proc_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement not found or access denied';
  END IF;

  -- 1. Update stock: subtract qty and recalculate avg_cost from remaining rows
  UPDATE stock s
  SET
    quantity = GREATEST(0, s.quantity - v_quantity),
    avg_cost = COALESCE(
      (SELECT SUM(p2.cost) / NULLIF(SUM(p2.quantity), 0)
       FROM   procurement p2
       WHERE  LOWER(p2.item_name) = LOWER(v_item_name)
         AND  p2.organization_id  = p_org_id
         AND  p2.id              != p_proc_id),
      0
    )
  WHERE LOWER(s.item_name) = LOWER(v_item_name)
    AND s.organization_id  = p_org_id;

  -- 2. Delete stock_ledger IN entry
  DELETE FROM stock_ledger
  WHERE  reference_type  = 'procurement'
    AND  reference_id    = p_proc_id
    AND  organization_id = p_org_id;

  -- 3. Delete pay-now transaction (if any)
  BEGIN
    DELETE FROM transactions
    WHERE  reference_type  = 'procurement'
      AND  reference_id    = p_proc_id
      AND  organization_id = p_org_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- 4. Unlink distributions / batch_chick_purchases (keep them, just unlink the lot)
  UPDATE distributions        SET procurement_id = NULL WHERE procurement_id = p_proc_id;
  UPDATE batch_chick_purchases SET procurement_id = NULL WHERE procurement_id = p_proc_id;

  -- 5. Delete the procurement row
  DELETE FROM procurement WHERE id = p_proc_id AND organization_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_procurement(uuid, uuid) TO authenticated;
