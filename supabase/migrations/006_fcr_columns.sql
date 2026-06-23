-- Migration 006: FCR (Feed Conversion Ratio) columns
-- Run this in Supabase SQL Editor

-- 1a. Add kg_per_unit to items catalog (for informational use)
ALTER TABLE items ADD COLUMN IF NOT EXISTS kg_per_unit numeric;

-- 1b. Add kg_per_unit to stock table (used by distributions for FCR calculation)
--     This is what the distribution flow reads: distributions.stock_id → stock.kg_per_unit
ALTER TABLE stock ADD COLUMN IF NOT EXISTS kg_per_unit numeric;

-- 2. Add FCR fields to batches (stored at batch close time)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS total_feed_kg numeric;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS total_sale_kg numeric;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fcr numeric;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fcr_rating text;
-- fcr_rating: 'Excellent' | 'Good' | 'Average' | 'Poor'

-- 3. Ensure chicken_count exists on sales (from previous work)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS chicken_count integer;
UPDATE sales SET chicken_count = 0 WHERE chicken_count IS NULL;
