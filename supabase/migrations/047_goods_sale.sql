-- Add goods sale support to the sales table
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'chicken',
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES items(id),
  ADD COLUMN IF NOT EXISTS item_quantity numeric,
  ADD COLUMN IF NOT EXISTS purchase_cost_per_unit numeric;

-- Backfill existing rows explicitly (they are all chicken sales)
UPDATE sales SET sale_type = 'chicken' WHERE sale_type IS NULL OR sale_type = '';

-- Goods sales have no batch — drop the NOT NULL constraint on batch_id
ALTER TABLE sales ALTER COLUMN batch_id DROP NOT NULL;
