-- Transfer all data from old user → new user
-- Old: 3dd3f065-a7f3-4def-88f0-4ac80b0678a5
-- New: be16bcd7-919b-4c55-828c-79c656056b03

DO $$
DECLARE
  v_old UUID := '3dd3f065-a7f3-4def-88f0-4ac80b0678a5';
  v_new UUID := 'be16bcd7-919b-4c55-828c-79c656056b03';
BEGIN

  -- ── organization_users ────────────────────────────────────────────────────
  -- If new user is already a member of any org the old user owns/belongs to,
  -- remove the new user's row first to avoid the UNIQUE(org_id, user_id) conflict.
  DELETE FROM organization_users
  WHERE user_id = v_new
    AND organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = v_old
    );

  -- Transfer all org memberships to new user
  UPDATE organization_users SET user_id   = v_new WHERE user_id   = v_old;
  UPDATE organization_users SET invited_by = v_new WHERE invited_by = v_old;

  -- ── invitations ───────────────────────────────────────────────────────────
  UPDATE invitations SET invited_by = v_new WHERE invited_by = v_old;

  -- ── audit fields (created_by_id / updated_by_id) ─────────────────────────
  UPDATE procurement          SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE procurement          SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE sales                SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE sales                SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE expenses             SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE expenses             SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE cash_collection      SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE cash_collection      SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE transactions         SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE transactions         SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE distributions        SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE distributions        SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE batches              SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE batches              SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE supplier_payments    SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE supplier_payments    SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE growing_fee_advances SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE growing_fee_advances SET updated_by_id = v_new WHERE updated_by_id = v_old;

  UPDATE stock_returns        SET created_by_id = v_new WHERE created_by_id = v_old;
  -- stock_returns has no updated_by_id

  UPDATE farm_expenses        SET created_by_id = v_new WHERE created_by_id = v_old;
  -- farm_expenses has no updated_by_id

  UPDATE accounts             SET created_by_id = v_new WHERE created_by_id = v_old;
  UPDATE accounts             SET updated_by_id = v_new WHERE updated_by_id = v_old;

  RAISE NOTICE 'Transfer complete: % → %', v_old, v_new;
END $$;
