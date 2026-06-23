-- Migration 009: Backfill transactions for existing growing_fee_advances
-- that were inserted before the transaction insert logic was in place.
-- Safe to run multiple times (uses NOT EXISTS check).

INSERT INTO transactions (
  account_id,
  transaction_type,
  category,
  description,
  amount,
  transaction_date,
  reference_type,
  reference_id,
  created_at
)
SELECT
  gfa.account_id,
  'out'                        AS transaction_type,
  'growing_fee_advance'        AS category,
  CONCAT(
    'Growing fee advance — ',
    COALESCE(f.owner_name, f.name, 'Farm owner'),
    ', Batch ',
    TO_CHAR(b.start_date, 'DD Mon YYYY')
  )                            AS description,
  gfa.amount,
  gfa.payment_date             AS transaction_date,
  'growing_fee_advance'        AS reference_type,
  gfa.id                       AS reference_id,
  gfa.created_at
FROM growing_fee_advances gfa
JOIN farms   f ON f.id = gfa.farm_id
JOIN batches b ON b.id = gfa.batch_id
WHERE gfa.account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.reference_type = 'growing_fee_advance'
      AND t.reference_id   = gfa.id
  );
