-- Round any existing farm_expenses rows that have floating-point artifacts
-- (e.g. cost_per_unit = 15576.923076923..., total_cost = 202500.000000001)
-- Safe to run multiple times (no-op if already clean).

UPDATE farm_expenses
SET
  cost_per_unit = ROUND(cost_per_unit::numeric, 2),
  total_cost    = ROUND(total_cost::numeric,    2)
WHERE
  cost_per_unit IS DISTINCT FROM ROUND(cost_per_unit::numeric, 2)
  OR total_cost IS DISTINCT FROM ROUND(total_cost::numeric,    2);
