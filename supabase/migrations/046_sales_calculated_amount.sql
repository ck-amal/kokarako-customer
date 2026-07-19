-- Stores the user-adjusted final amount when they override the auto-calculated
-- total (kg_sold * price_per_kg). Null means no override — use total_amount.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS final_amount numeric(12,2);
