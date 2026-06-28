-- ─── 027 · Cash collection — in-hand → verify workflow ──────────────────────
-- Collections NO LONGER post to a company account on record. They sit as
-- 'pending' (held by the collector) until an owner/accountant VERIFIES them,
-- which posts the money to a company account and clears it from the collector's
-- "cash in hand". Verification happens via a SECURITY DEFINER RPC so the posting
-- only ever occurs with proper authorization. Run on khbuypzugydxvejjcoam.
-- Idempotent.

-- 1. Schema ───────────────────────────────────────────────────────────────────
ALTER TABLE cash_collection ALTER COLUMN sale_id DROP NOT NULL;  -- sale now optional

ALTER TABLE cash_collection
  ADD COLUMN IF NOT EXISTS collected_by_id   UUID,
  ADD COLUMN IF NOT EXISTS collected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS method            TEXT NOT NULL DEFAULT 'cash'
                            CHECK (method IN ('cash','online','cheque','other')),
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','verified','rejected')),
  ADD COLUMN IF NOT EXISTS verified_by_id    UUID,
  ADD COLUMN IF NOT EXISTS verified_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_id        UUID REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS transaction_id    UUID,
  ADD COLUMN IF NOT EXISTS reject_reason     TEXT;

CREATE INDEX IF NOT EXISTS idx_cc_status    ON cash_collection(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cc_collector ON cash_collection(organization_id, collected_by_id, status);

-- 2. Backfill existing rows (already posted under the old flow → 'verified';
--    collector = original creator). Safe on re-run: once collected_by_id is set,
--    these no longer match.
UPDATE cash_collection
   SET status = 'verified', verified_at = COALESCE(verified_at, created_at)
 WHERE status = 'pending' AND collected_by_id IS NULL;

UPDATE cash_collection
   SET collected_by_id = created_by_id, collected_by_name = created_by_name
 WHERE collected_by_id IS NULL;

-- 3. RLS — anyone (except view-only) records; collectors manage their own pending;
--    owner/accountant manage any.
DROP POLICY IF EXISTS "cc_insert" ON cash_collection;
CREATE POLICY "cc_insert" ON cash_collection FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id()
              AND get_user_role() IN ('owner','manager','farm_supervisor','accountant'));

DROP POLICY IF EXISTS "cc_update" ON cash_collection;
CREATE POLICY "cc_update" ON cash_collection FOR UPDATE
  USING (organization_id = get_user_organization_id()
         AND ((collected_by_id = auth.uid() AND status = 'pending')
              OR get_user_role() IN ('owner','accountant')));

DROP POLICY IF EXISTS "cc_delete" ON cash_collection;
CREATE POLICY "cc_delete" ON cash_collection FOR DELETE
  USING (organization_id = get_user_organization_id()
         AND ((collected_by_id = auth.uid() AND status = 'pending')
              OR get_user_role() = 'owner'));

-- 4. Verify RPC — owner/accountant only; posts the money + clears the hand. ─────
CREATE OR REPLACE FUNCTION verify_cash_collection(
  p_id              UUID,
  p_account_id      UUID,
  p_verified_by_name TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT := get_user_role();
  v_org  UUID := get_user_organization_id();
  v_cc   cash_collection%ROWTYPE;
  v_vname TEXT;
  v_txn  UUID;
BEGIN
  IF v_role NOT IN ('owner','accountant') THEN
    RAISE EXCEPTION 'Only an owner or accountant can verify collections';
  END IF;

  SELECT * INTO v_cc FROM cash_collection WHERE id = p_id;
  IF NOT FOUND OR v_cc.organization_id <> v_org THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;
  IF v_cc.status <> 'pending' THEN
    RAISE EXCEPTION 'Collection is not pending (already %).', v_cc.status;
  END IF;

  SELECT name INTO v_vname FROM vendors WHERE id = v_cc.vendor_id;

  INSERT INTO transactions (
    organization_id, account_id, transaction_type, category, description,
    amount, transaction_date, reference_type, reference_id, created_by_id, created_by_name
  ) VALUES (
    v_org, p_account_id, 'in', 'cash_collection',
    'Verified collection' || COALESCE(' — ' || v_vname, ''),
    v_cc.amount_paid, CURRENT_DATE, 'cash_collection', v_cc.id, v_uid, p_verified_by_name
  ) RETURNING id INTO v_txn;

  UPDATE cash_collection SET
    status = 'verified', verified_by_id = v_uid, verified_by_name = p_verified_by_name,
    verified_at = NOW(), account_id = p_account_id, transaction_id = v_txn,
    updated_by_id = v_uid, updated_by_name = p_verified_by_name, updated_at = NOW()
  WHERE id = p_id;

  RETURN v_txn;
END $$;
GRANT EXECUTE ON FUNCTION verify_cash_collection TO authenticated;

-- 5. Reject RPC — owner/accountant only; nothing posts. ───────────────────────
CREATE OR REPLACE FUNCTION reject_cash_collection(
  p_id      UUID,
  p_reason  TEXT DEFAULT NULL,
  p_by_name TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT := get_user_role();
BEGIN
  IF v_role NOT IN ('owner','accountant') THEN
    RAISE EXCEPTION 'Only an owner or accountant can reject collections';
  END IF;

  UPDATE cash_collection SET
    status = 'rejected', reject_reason = p_reason,
    verified_by_id = v_uid, verified_by_name = p_by_name, verified_at = NOW(),
    updated_by_id = v_uid, updated_by_name = p_by_name, updated_at = NOW()
  WHERE id = p_id AND organization_id = get_user_organization_id() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection not pending or not found';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION reject_cash_collection TO authenticated;
