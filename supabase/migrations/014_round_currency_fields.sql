-- Round all currency fields that may contain floating-point artifacts.
-- Safe to run multiple times (IS DISTINCT FROM guard prevents no-op updates).

-- Procurement: cost_per_unit computed by division (e.g. 202500/13 = 15576.923076...)
UPDATE procurement
SET cost_per_unit = ROUND(cost_per_unit::numeric, 2)
WHERE cost_per_unit IS NOT NULL
  AND cost_per_unit IS DISTINCT FROM ROUND(cost_per_unit::numeric, 2);

-- Also round procurement.cost in case it was ever stored with extra precision
UPDATE procurement
SET cost = ROUND(cost::numeric, 2)
WHERE cost IS DISTINCT FROM ROUND(cost::numeric, 2);

-- Growing fee ledger: totalFee, advances, balance, paid amounts
UPDATE growing_fee_ledger
SET
  total_fee       = ROUND(total_fee::numeric,       2),
  total_advances  = ROUND(total_advances::numeric,  2),
  overpaid_amount = ROUND(overpaid_amount::numeric, 2),
  amount_paid     = ROUND(amount_paid::numeric,     2),
  balance_due     = ROUND(balance_due::numeric,     2)
WHERE
  total_fee       IS DISTINCT FROM ROUND(total_fee::numeric,       2)
  OR total_advances  IS DISTINCT FROM ROUND(total_advances::numeric,  2)
  OR overpaid_amount IS DISTINCT FROM ROUND(overpaid_amount::numeric, 2)
  OR amount_paid     IS DISTINCT FROM ROUND(amount_paid::numeric,     2)
  OR balance_due     IS DISTINCT FROM ROUND(balance_due::numeric,     2);

-- farm_expenses: already covered by migration 012, but re-apply for safety
UPDATE farm_expenses
SET
  cost_per_unit = ROUND(cost_per_unit::numeric, 2),
  total_cost    = ROUND(total_cost::numeric,    2)
WHERE
  cost_per_unit IS DISTINCT FROM ROUND(cost_per_unit::numeric, 2)
  OR total_cost IS DISTINCT FROM ROUND(total_cost::numeric,    2);
